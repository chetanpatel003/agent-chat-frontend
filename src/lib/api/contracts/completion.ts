// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { SendMessageRequestSchema } from "./message";

// Chat-style completion: one call that submits a user turn — into an
// existing chat, or a new one — and returns the run to follow. The agent
// runs asynchronously (minutes, for media tools): poll the run, subscribe
// to realtime, or receive webhooks; read the reply from the chat's messages.
export const CompletionRequestSchema = SendMessageRequestSchema.extend({
  chatId: z.uuid().optional(),
});
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

export const CompletionResponseSchema = z.object({
  chatId: z.uuid(),
  runId: z.uuid(),
  messageId: z.uuid(),
  status: z.literal("QUEUED"),
  links: z.object({ run: z.string(), messages: z.string() }),
});
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;
