// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { cursorPaginationResponse } from "./pagination";

export const CreateChatRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;

export const UpdateChatRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.isPinned !== undefined, {
    message: "At least one field must be provided",
  });
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>;

export const ChatResponseSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  isPinned: z.boolean(),
  lastMessageAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatListResponseSchema = cursorPaginationResponse(ChatResponseSchema);
export type ChatListResponse = z.infer<typeof ChatListResponseSchema>;
