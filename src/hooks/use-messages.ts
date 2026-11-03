"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMessages, sendMessage } from "@/lib/api/messages";
import type { PaginatedMessageResponse, SendMessageRequest } from "@/lib/api/contracts";
import { MEDIA_TOOLS } from "@/lib/media-tools";
import { usePendingSends, type PendingSend } from "@/stores/pending-sends";

/**
 * Loads a chat's most recent messages first, then older pages on demand.
 * `getNextPageParam` reads `olderCursor`, not a generic `nextCursor` —
 * getting this wrong (e.g. copy-pasting the chats-list hook's
 * `lastPage.nextCursor`) would silently never paginate, since
 * PaginatedMessageResponse has no such field; the type system catches
 * that mismatch at compile time, not just by convention.
 */
/** How long after a turn we keep checking for usage that settles late, and how often. */
export const LATE_SETTLEMENT_WINDOW_MS = 15 * 60_000;
export const LATE_SETTLEMENT_POLL_MS = 30_000;
/** A result can be recovered after its turn stopped tracking it (the billable
 * sweep acts on runs idle for 15 min, every 10 min): keep checking this long. */
export const LATE_RESULT_WINDOW_MS = 45 * 60_000;

/**
 * True when a recent assistant turn has a successful media result whose
 * usage isn't settled yet (settlement can finish after the turn, e.g. via
 * the recovery sweep). Bounded by LATE_SETTLEMENT_WINDOW_MS so a result
 * that never reports usage doesn't poll forever.
 */
export function awaitsLateSettlement(pages: PaginatedMessageResponse[] | undefined, now?: number): boolean {
  for (const message of pages?.[0]?.items ?? []) {
    if (message.role !== "ASSISTANT") continue;
    // A turn whose run ended while it was still pending (interrupted, lost
    // provider response): its result may still be recovered into this message.
    if (message.status === "PENDING" && message.error !== null) {
      if ((now ?? Date.now()) - Date.parse(message.createdAt) <= LATE_RESULT_WINDOW_MS) return true;
      continue;
    }
    // The clock is read only when there is a message to check (never while prerendering).
    if ((now ?? Date.now()) - Date.parse(message.createdAt) > LATE_SETTLEMENT_WINDOW_MS) continue;
    const completedMedia = new Set(
      message.content.flatMap((b) =>
        b.type === "tool_use" && b.status === "COMPLETED" && MEDIA_TOOLS.has(b.toolName) ? [b.toolInvocationId] : [],
      ),
    );
    const unsettled = message.content.some(
      (b) => b.type === "tool_result" && completedMedia.has(b.toolInvocationId) && b.error === null && b.creditsCharged === null,
    );
    if (unsettled) return true;
  }
  return false;
}

export function useMessages(chatId: string | undefined, opts: { limit?: number } = {}) {
  const { getToken, isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: async ({ pageParam }) =>
      listMessages(await getToken(), chatId as string, {
        cursor: pageParam,
        limit: opts.limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.olderCursor ?? undefined,
    enabled: isSignedIn === true && !!chatId,
    // Late settlement: refresh so the usage appears (in place, no duplicate) once recorded.
    refetchInterval: (query) => (awaitsLateSettlement(query.state.data?.pages) ? LATE_SETTLEMENT_POLL_MS : false),
  });
}

/** Shown in the conversation while admission is in flight (never sent). */
export type SendPreview = { attachments: PendingSend["attachments"] };

/**
 * Admits a message via the real backend endpoint. The idempotency key
 * is the caller's to manage (generate fresh per intentional send, reuse
 * on a retry of the same send) — this hook only forwards it.
 *
 * Optimistic UI: the message appears at once as a pending send
 * (stores/pending-sends.ts). On success the entry records the persisted
 * message id — from then on the list hides it whenever the messages
 * query already contains that id, so the two never show together — and
 * it is removed once the reconciling refetch has finished. On failure
 * it is removed and the composer restores the draft.
 *
 * Also invalidates the chats list (lastMessageAt/sort order), the
 * active-run query (which starts useRunActivity's realtime subscription
 * for the freshly dispatched run) and the media library (a sent upload
 * joins it).
 */
export function useSendMessage(chatId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      idempotencyKey,
      body,
    }: {
      idempotencyKey: string;
      body: SendMessageRequest;
      preview?: SendPreview;
    }) => sendMessage(await getToken(), chatId as string, idempotencyKey, body),
    onMutate: ({ body, preview }) => {
      const localId = crypto.randomUUID();
      usePendingSends.getState().add({
        localId,
        chatId: chatId as string,
        text: body.text,
        attachments: preview?.attachments ?? [],
        serverMessageId: null,
      });
      return { localId };
    },
    onSuccess: async (response, _vars, context) => {
      usePendingSends.getState().admitted(context.localId, response.messageId);
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
      void queryClient.invalidateQueries({ queryKey: ["active-run", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["media-library"] });
      try {
        await queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      } finally {
        usePendingSends.getState().remove(context.localId);
      }
    },
    onError: (_error, _vars, context) => {
      if (context) usePendingSends.getState().remove(context.localId);
    },
  });
}
