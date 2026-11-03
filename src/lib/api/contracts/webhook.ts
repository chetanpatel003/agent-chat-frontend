// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

// Outbound lifecycle webhooks (assessment: "Emit signed lifecycle webhooks for
// agent started, agent completed, agent failed, and tool completed events").
// Payloads carry identifiers and statuses only — never message content,
// tool inputs/outputs or provider data; consumers read details over REST.

export const WEBHOOK_EVENT_TYPES = ["agent.started", "agent.completed", "agent.failed", "tool.completed"] as const;
export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const WebhookEventSchema = z.strictObject({
  /** Stable per event: the same lifecycle event always has the same id (dedupe on it). */
  id: z.string().min(1),
  type: WebhookEventTypeSchema,
  createdAt: z.iso.datetime(),
  data: z.strictObject({
    runId: z.uuid(),
    chatId: z.uuid(),
    status: z.string(),
    errorCode: z.string().optional(),
    toolInvocationId: z.uuid().optional(),
    toolName: z.string().optional(),
  }),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const CreateWebhookEndpointRequestSchema = z.object({
  /** HTTPS only. */
  url: z.url().refine((u) => u.startsWith("https://"), "Webhook URLs must use https"),
  events: z.array(WebhookEventTypeSchema).min(1).default([...WEBHOOK_EVENT_TYPES]),
});
export type CreateWebhookEndpointRequest = z.infer<typeof CreateWebhookEndpointRequestSchema>;

export const WebhookEndpointResponseSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(WebhookEventTypeSchema),
  createdAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
});
export type WebhookEndpointResponse = z.infer<typeof WebhookEndpointResponseSchema>;

/** Returned once, at creation: the only time the signing secret is shown. */
export const CreatedWebhookEndpointResponseSchema = WebhookEndpointResponseSchema.extend({ secret: z.string() });
export type CreatedWebhookEndpointResponse = z.infer<typeof CreatedWebhookEndpointResponseSchema>;

export const WebhookEndpointListResponseSchema = z.object({ items: z.array(WebhookEndpointResponseSchema) });
export type WebhookEndpointListResponse = z.infer<typeof WebhookEndpointListResponseSchema>;
