// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { enumSchema } from "./enum-schema";
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
  createdAt: z.iso.datetime(),
});
export type AttachmentResponse = z.infer<typeof AttachmentResponseSchema>;
