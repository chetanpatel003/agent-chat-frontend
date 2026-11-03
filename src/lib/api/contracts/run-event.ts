// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { AgentRunStatusSchema, WaitpointStatusSchema, WaitpointTypeSchema } from "./agent-run";
import { MessageStatusSchema } from "./message";

// Published into Trigger.dev run metadata (realtime/publish-run-event.ts),
// per PHASE2-PLAN.md §Decision B. Consumed by the frontend starting
// checkpoint 3.4.2 (src/hooks/use-run-activity.ts, agent-chat-frontend)
// via @trigger.dev/react-hooks' useRealtimeRun, reading this same shape
// back out of the subscribed run's own metadata. Turn-level events
// only: token-level assistant text travels on a separate typed realtime
// stream (contracts/text-stream.ts), never in metadata.
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
  // Monotonically increasing per AgentRun, including across Trigger.dev
  // retry attempts (the emitter resumes after the highest published
  // seq; see realtime/publish-run-event.ts) — lets a client order
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

/** A long-running tool's progress (labels only). `provider_waiting`: the
 * provider accepted the job (its run id is persisted) and we are now
 * waiting for its result. */
export const ToolProgressPhaseSchema = z.enum(["provider_waiting"]);
export type ToolProgressPhase = z.infer<typeof ToolProgressPhaseSchema>;

const ToolProgressEventSchema = z.strictObject({
  type: z.literal("tool_progress"),
  ...BaseEventFields,
  toolInvocationId: z.uuid(),
  toolName: z.string(),
  phase: ToolProgressPhaseSchema,
});

/** What the agent is doing right now (tool activity has its own tool_* events). Labels only — never model reasoning. */
export const RunStepSchema = z.enum(["thinking", "responding", "waiting"]);
export type RunStep = z.infer<typeof RunStepSchema>;

const StepEventSchema = z.strictObject({
  type: z.literal("step"),
  ...BaseEventFields,
  step: RunStepSchema,
  /** Zero-based model round within the turn. */
  round: z.number().int().nonnegative(),
  toolName: z.string().optional(),
});

/** Time from the start of a model round to its first output (or its response). */
const ThinkingCompletedEventSchema = z.strictObject({
  type: z.literal("thinking_completed"),
  ...BaseEventFields,
  round: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

const WaitpointEventSchema = z.strictObject({
  type: z.literal("waitpoint"),
  ...BaseEventFields,
  waitpointId: z.uuid(),
  waitpointType: WaitpointTypeSchema,
  status: WaitpointStatusSchema,
});

export const RunEventSchema = z.discriminatedUnion("type", [
  RunStatusEventSchema,
  AssistantMessageEventSchema,
  ToolStartedEventSchema,
  ToolCompletedEventSchema,
  ToolFailedEventSchema,
  ToolProgressEventSchema,
  StepEventSchema,
  ThinkingCompletedEventSchema,
  WaitpointEventSchema,
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
