"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  authorizeAttachmentUpload,
  cancelAttachmentUpload,
  completeAttachmentUpload,
  createAttachment,
} from "@/lib/api/attachments";
import { startTransloaditUpload, type UploadHandle } from "@/lib/uploads/transloadit-upload";
import {
  isUploadMimeType,
  maxUploadBytes,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type AttachmentResponse,
} from "@/lib/api/contracts";

/** A library item's display name: its original filename, else its kind. */
export function libraryName(item: Pick<AttachmentResponse, "metadata" | "mimeType" | "source">): string {
  if (item.metadata.filename) return item.metadata.filename;
  const kind = item.mimeType.startsWith("video/") ? "video" : "image";
  return item.source === "GENERATED" ? `Generated ${kind}` : kind === "video" ? "Video" : "Image";
}

export type ComposerAttachmentStatus = "uploading" | "ready" | "failed" | "cancelled" | "rejected";

export type ComposerAttachment = {
  localId: string;
  /** "upload": a new file going through Transloadit. "library": an existing
   * media-library item, already stored — referenced by id, never uploaded. */
  origin: "upload" | "library";
  /** The local file (uploads only). */
  file: File | null;
  name: string;
  kind: "image" | "video";
  previewUrl: string | null;
  status: ComposerAttachmentStatus;
  progress: number;
  error: string | null;
  attachmentId: string | null;
};

function previewFor(file: File): string | null {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
}

function revoke(item: ComposerAttachment) {
  // Library previews are server URLs, not object URLs.
  if (item.origin === "upload" && item.previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function rejection(file: File): string | null {
  if (!isUploadMimeType(file.type)) return "Unsupported file type";
  if (file.size > maxUploadBytes(file.type)) return "File is too large";
  return null;
}

/**
 * Composer-local upload state, in the order files were added. The
 * server, not this hook, decides whether an upload is usable: an item is
 * only "ready" after the backend has verified its Assembly.
 */
export function useComposerAttachments(chatId: string) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<ComposerAttachment[]>([]);
  // Source of truth for async callbacks; every write goes through commit().
  const itemsRef = useRef<ComposerAttachment[]>([]);
  const handles = useRef(new Map<string, UploadHandle>());
  // Bumped on every start/cancel/remove, so callbacks from a superseded
  // attempt (e.g. a late completion after Cancel) are ignored.
  const attempts = useRef(new Map<string, number>());

  const commit = useCallback((next: ComposerAttachment[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const update = useCallback(
    (localId: string, patch: Partial<ComposerAttachment>) =>
      commit(itemsRef.current.map((item) => (item.localId === localId ? { ...item, ...patch } : item))),
    [commit],
  );

  const isCurrentAttempt = (localId: string, attempt: number) => attempts.current.get(localId) === attempt;

  const run = useCallback(
    async (localId: string) => {
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (!item?.file) return;
      const file = item.file;
      const attempt = (attempts.current.get(localId) ?? 0) + 1;
      attempts.current.set(localId, attempt);
      update(localId, { status: "uploading", progress: 0, error: null });

      const fail = (error: string) => {
        if (!isCurrentAttempt(localId, attempt)) return;
        attempts.current.set(localId, attempt + 1);
        update(localId, { status: "failed", error });
      };

      const mimeType = file.type;
      if (!isUploadMimeType(mimeType)) return fail("Unsupported file type");
      let attachmentId = item.attachmentId;
      try {
        if (!attachmentId) {
          const created = await createAttachment(await getToken(), {
            chatId,
            filename: item.name,
            mimeType,
            sizeBytes: file.size,
          });
          attachmentId = created.id;
          update(localId, { attachmentId });
        }
      } catch {
        return fail("Upload could not start");
      }
      if (!isCurrentAttempt(localId, attempt)) return;

      const id = attachmentId;
      handles.current.set(
        localId,
        startTransloaditUpload(file, async () => authorizeAttachmentUpload(await getToken(), id), {
          onProgress: (fraction) => {
            if (isCurrentAttempt(localId, attempt)) update(localId, { progress: fraction });
          },
          onComplete: async (assemblyId) => {
            if (!isCurrentAttempt(localId, attempt)) return;
            try {
              await completeAttachmentUpload(await getToken(), id, assemblyId);
              if (isCurrentAttempt(localId, attempt)) update(localId, { status: "ready", progress: 1 });
            } catch {
              fail("Upload could not be verified");
            }
          },
          onError: () => fail("Upload failed"),
        }),
      );
    },
    [chatId, getToken, update],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - itemsRef.current.filter((i) => i.status !== "rejected").length;
      const added: ComposerAttachment[] = files.map((file, index) => {
        const reason = index >= room ? `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message` : rejection(file);
        return {
          localId: crypto.randomUUID(),
          origin: "upload",
          file,
          name: file.name,
          kind: file.type.startsWith("video/") ? "video" : "image",
          previewUrl: reason ? null : previewFor(file),
          status: reason ? "rejected" : "uploading",
          progress: 0,
          error: reason,
          attachmentId: null,
        };
      });
      commit([...itemsRef.current, ...added]);
      for (const item of added) if (item.status === "uploading") void run(item.localId);
    },
    [commit, run],
  );

  /**
   * Media-library picks, appended in selection order after what is already
   * in the composer. Already-present items and anything past the per-message
   * limit are skipped (the picker prevents both). Nothing is uploaded or
   * copied: the existing attachment id is sent with the message.
   */
  const addFromLibrary = useCallback(
    (picks: AttachmentResponse[]) => {
      const present = new Set(itemsRef.current.map((i) => i.attachmentId));
      const room = MAX_ATTACHMENTS_PER_MESSAGE - itemsRef.current.filter((i) => i.status !== "rejected").length;
      const added: ComposerAttachment[] = picks
        .filter((pick) => !present.has(pick.id) && pick.url !== null)
        .slice(0, Math.max(0, room))
        .map((pick) => ({
          localId: crypto.randomUUID(),
          origin: "library",
          file: null,
          name: libraryName(pick),
          kind: pick.mimeType.startsWith("video/") ? "video" : "image",
          previewUrl: pick.url,
          status: "ready",
          progress: 1,
          error: null,
          attachmentId: pick.id,
        }));
      commit([...itemsRef.current, ...added]);
    },
    [commit],
  );

  const releaseServerSide = useCallback(
    async (item: ComposerAttachment) => {
      // A library item belongs to earlier messages: never cancel it.
      if (item.origin !== "upload" || !item.attachmentId) return;
      try {
        await cancelAttachmentUpload(await getToken(), item.attachmentId);
      } catch {
        // Best effort: an unsent upload is never usable by anyone else.
      }
    },
    [getToken],
  );

  const cancel = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (!item || item.status !== "uploading") return;
      attempts.current.set(localId, (attempts.current.get(localId) ?? 0) + 1);
      handles.current.get(localId)?.cancel();
      handles.current.delete(localId);
      update(localId, { status: "cancelled", error: null });
      void releaseServerSide(item);
    },
    [releaseServerSide, update],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (item?.origin === "upload" && (item.status === "failed" || item.status === "cancelled")) void run(localId);
    },
    [run],
  );

  const remove = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (!item) return;
      attempts.current.delete(localId);
      handles.current.get(localId)?.cancel();
      handles.current.delete(localId);
      revoke(item);
      commit(itemsRef.current.filter((i) => i.localId !== localId));
      if (item.status !== "cancelled") void releaseServerSide(item);
    },
    [commit, releaseServerSide],
  );

  /** After a successful send: the uploads now belong to the message. */
  const clear = useCallback(() => {
    itemsRef.current.forEach(revoke);
    handles.current.clear();
    attempts.current.clear();
    commit([]);
  }, [commit]);

  useEffect(() => {
    const live = handles.current;
    const current = itemsRef;
    return () => {
      live.forEach((handle) => handle.cancel());
      current.current.forEach(revoke);
    };
  }, []);

  const allReady = items.every((i) => i.status === "ready");
  const readyIds = allReady ? items.map((i) => i.attachmentId).filter((id): id is string => !!id) : [];
  const blockedReason = items.some((i) => i.status === "uploading")
    ? "Wait for uploads to finish"
    : !allReady
      ? "Remove or retry failed uploads"
      : null;

  return { items, addFiles, addFromLibrary, cancel, retry, remove, clear, readyIds, blockedReason };
}
