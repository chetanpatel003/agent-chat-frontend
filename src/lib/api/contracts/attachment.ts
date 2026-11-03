// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { enumSchema } from "./enum-schema";
import { cursorPaginationResponse } from "./pagination";
import { AttachmentSource, AttachmentStatus } from "./prisma-enums";

export const AttachmentSourceSchema = enumSchema(AttachmentSource);
export const AttachmentStatusSchema = enumSchema(AttachmentStatus);

export const AttachmentMetadataSchema = z.object({
  filename: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});
export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;

export const AttachmentResponseSchema = z.object({
  id: z.uuid(),
  messageId: z.uuid().nullable(),
  source: AttachmentSourceSchema,
  status: AttachmentStatusSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  url: z.url().nullable(),
  metadata: AttachmentMetadataSchema,
  order: z.number().int().nonnegative(),
  /** Generated media: the tool invocation that produced it (with `order` = its output index). Null for uploads. */
  toolInvocationId: z.uuid().nullable().optional(),
  createdAt: z.iso.datetime(),
});
export type AttachmentResponse = z.infer<typeof AttachmentResponseSchema>;

// The media library: the user's ready, permanently stored media that already
// appears in one of their chats (sent uploads and generated outputs), newest
// first. A picked item is attached by its existing id — no copy is made.
// `url` is null when a signed URL can't be produced right now (unavailable).
export const MediaLibraryPageSchema = cursorPaginationResponse(AttachmentResponseSchema);
export type MediaLibraryPage = z.infer<typeof MediaLibraryPageSchema>;

// ---------- Upload limits (enforced server-side; mirrored in the UI) ----------
// Only formats the Magica media tools accept. Sizes stay well under the
// Transloadit Community plan's 0.5 GB per-file limit.
export const UPLOAD_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const UPLOAD_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const UPLOAD_MIME_TYPES = [...UPLOAD_IMAGE_MIME_TYPES, ...UPLOAD_VIDEO_MIME_TYPES] as const;
export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];

export function isUploadMimeType(value: string): value is UploadMimeType {
  return (UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

export function maxUploadBytes(mimeType: UploadMimeType): number {
  return mimeType.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}

export const CreateAttachmentRequestSchema = z
  .object({
    chatId: z.uuid().optional(),
    filename: z.string().trim().min(1).max(255),
    mimeType: z.enum(UPLOAD_MIME_TYPES),
    sizeBytes: z.number().int().positive(),
  })
  .refine((v) => v.sizeBytes <= maxUploadBytes(v.mimeType), {
    message: "File is too large for its type",
    path: ["sizeBytes"],
  });
export type CreateAttachmentRequest = z.infer<typeof CreateAttachmentRequestSchema>;

/** Signed Transloadit Assembly parameters for exactly one upload. The
 * secret never leaves the server; only the HMAC signature does. */
export const UploadAuthorizationResponseSchema = z.object({
  params: z.string(),
  signature: z.string(),
  expiresAt: z.iso.datetime(),
});
export type UploadAuthorizationResponse = z.infer<typeof UploadAuthorizationResponseSchema>;

export const AssemblyIdSchema = z.string().regex(/^[a-f0-9]{32}$/, "Invalid assembly id");

export const CompleteAttachmentRequestSchema = z.object({
  assemblyId: AssemblyIdSchema,
});
export type CompleteAttachmentRequest = z.infer<typeof CompleteAttachmentRequestSchema>;
