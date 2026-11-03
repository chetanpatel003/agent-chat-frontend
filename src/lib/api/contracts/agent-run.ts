// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { enumSchema } from "./enum-schema";
import {
  AgentRunStatus,
  ToolInvocationStatus,
  WaitpointStatus,
  WaitpointType,
  WaitingReason,
} from "./prisma-enums";

export const AgentRunStatusSchema = enumSchema(AgentRunStatus);
export const ToolInvocationStatusSchema = enumSchema(ToolInvocationStatus);
export const WaitpointStatusSchema = enumSchema(WaitpointStatus);
export const WaitpointTypeSchema = enumSchema(WaitpointType);
export const WaitingReasonSchema = enumSchema(WaitingReason);

export const AgentRunResponseSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  status: AgentRunStatusSchema,
  waitingReason: WaitingReasonSchema.nullable(),
  model: z.string().nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  turnCount: z.number().int().nonnegative(),
  planMode: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  // Checkpoint 3.4.2 — the Trigger.dev run id a client needs to open a
  // realtime subscription. Already existed on the AgentRun row since
  // checkpoint 1.1; never exposed in this response until a frontend
  // consumer needed it. Null until dispatch completes (a brief window
  // during admission) or if dispatch never happened.
  triggerRunId: z.string().nullable(),
});
export type AgentRunResponse = z.infer<typeof AgentRunResponseSchema>;

// Checkpoint 3.4.2 — a short-lived, narrowly-scoped Trigger.dev public
// access token (read-only, scoped to exactly one run) that a browser
// can safely hold. Minted server-side only: generating it requires
// the Trigger.dev secret key, which must never reach the client.
export const RealtimeTokenResponseSchema = z.object({
  token: z.string(),
});
export type RealtimeTokenResponse = z.infer<typeof RealtimeTokenResponseSchema>;
