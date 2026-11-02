// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { AgentRunStatusSchema } from "./agent-run";
import { MessageStatusSchema } from "./message";

// Backend-internal, published into Trigger.dev run metadata
// (realtime/publish-run-event.ts), per PHASE2-PLAN.md §Decision B.
// Nothing in the frontend consumes this yet — that's the later realtime
// checkpoint. Turn-level events only, no token-level streaming deltas.
//
// Every variant uses z.strictObject(): an extra field is a validation
// FAILURE, not silently stripped. That is the enforcement mechanism for
// the hard constraint below — content can never leak through this
// contract even by accident, because any attempt to attach it makes the
// whole event fail to publish (see publish-run-event.ts, which never
// throws on a validation failure — it just doesn't publish).
//
// Deliberately excluded from every variant: assistant text/message
// content, tool inputs/outputs, provider responses, or any other
// execution payload. An event is a pointer to the REST resource
// (messageId / toolInvocationId) the client already knows how to fetch,
// never a copy of its content.

const BaseEventFields = {
  runId: z.uuid(),
  // Monotonically increasing within one execution — lets a client order
  // events and detect a gap, even though delivery itself isn't ordered
  // or guaranteed (Trigger.dev metadata, not a message queue).
  seq: z.number().int().nonnegative(),
  at: z.iso.datetime(),
};

const RunStatusEventSchema = z.strictObject({
  type: z.literal("run_status"),
  ...BaseEventFields,
  status: AgentRunStatusSchema,
  errorCode: z.string().optional(),
});

const AssistantMessageEventSchema = z.strictObject({
  type: z.literal("assistant_message"),
  ...BaseEventFields,
  messageId: z.uuid(),
  status: MessageStatusSchema,
});

const ToolStartedEventSchema = z.strictObject({
  type: z.literal("tool_started"),
  ...BaseEventFields,
  toolInvocationId: z.uuid(),
  toolName: z.string(),
});

const ToolCompletedEventSchema = z.strictObject({
  type: z.literal("tool_completed"),
  ...BaseEventFields,
  toolInvocationId: z.uuid(),
  toolName: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
});

const ToolFailedEventSchema = z.strictObject({
  type: z.literal("tool_failed"),
  ...BaseEventFields,
  toolInvocationId: z.uuid(),
  toolName: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
  errorCode: z.string().optional(),
});

export const RunEventSchema = z.discriminatedUnion("type", [
  RunStatusEventSchema,
  AssistantMessageEventSchema,
  ToolStartedEventSchema,
  ToolCompletedEventSchema,
  ToolFailedEventSchema,
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

/** Distributes over the union properly, unlike a plain `Omit<RunEvent, ...>`
 * (whose `keyof` over a union is the *intersection* of member keys, so it
 * would collapse every variant's own fields). Used by
 * realtime/publish-run-event.ts to type the "caller supplies everything
 * except the fields it auto-fills" helper. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
