// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { WaitpointStatusSchema, WaitpointTypeSchema } from "./agent-run";
import type { WaitpointType } from "./prisma-enums";

// One approval mechanism: the Waitpoint row (PostgreSQL, authoritative)
// paired with a Trigger.dev waitpoint token (what the run suspends on).
// Each waitpoint type is one entry here: its payload (what the user is
// asked) and its resolution (what they answer). Adding a type = adding an
// entry plus a caller in the agent loop.

const PlanPayloadSchema = z.strictObject({
  /** The model's proposed plan, shown verbatim for approval. */
  plan: z.string().min(1).max(20_000),
});

const PlanResolutionSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  /** Optional guidance passed to the model with an approval. */
  note: z.string().trim().max(2000).optional(),
});

export const WAITPOINT_DEFINITIONS = {
  PLAN: { payloadSchema: PlanPayloadSchema, resolutionSchema: PlanResolutionSchema, timeoutMs: 24 * 60 * 60_000 },
} as const satisfies Partial<
  Record<WaitpointType, { payloadSchema: z.ZodType; resolutionSchema: z.ZodType; timeoutMs: number }>
>;
export type SupportedWaitpointType = keyof typeof WAITPOINT_DEFINITIONS;
export type PlanPayload = z.infer<typeof PlanPayloadSchema>;
export type PlanResolution = z.infer<typeof PlanResolutionSchema>;

export function waitpointDefinition(type: WaitpointType) {
  return type in WAITPOINT_DEFINITIONS ? WAITPOINT_DEFINITIONS[type as SupportedWaitpointType] : null;
}

/** Request body for POST .../waitpoints/{id}/resolve; validated per type by the service. */
export const ResolveWaitpointRequestSchema = z.record(z.string(), z.unknown());

export const WaitpointResponseSchema = z.object({
  id: z.uuid(),
  agentRunId: z.uuid(),
  type: WaitpointTypeSchema,
  status: WaitpointStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  resolution: z.record(z.string(), z.unknown()).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type WaitpointResponse = z.infer<typeof WaitpointResponseSchema>;

export const WaitpointListResponseSchema = z.object({ items: z.array(WaitpointResponseSchema) });
export type WaitpointListResponse = z.infer<typeof WaitpointListResponseSchema>;
