// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { enumSchema } from "./enum-schema";
import { MessageRole, MessageStatus } from "./prisma-enums";
import { cursorPaginationResponse } from "./pagination";
import { ToolInvocationStatusSchema } from "./agent-run";

// Derive the Zod enum from Prisma's generated const object — one source of
// truth for the allowed values, no duplicated domain literals.
export const MessageRoleSchema = enumSchema(MessageRole);
export const MessageStatusSchema = enumSchema(MessageStatus);

// ---------- Ordered content blocks ----------
// Everything the agent/tool loop can emit into a message, in the order
// they were produced. Deliberately minimal per block — enough for the
// product's rendering requirements (text, thinking/status, tool cards,
// reasoning summaries, citations, usage) without becoming a generic
// "any shape" escape hatch. Validated at write time (orchestrator) and at
// read time (API response), per "Zod at every trust boundary."

const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ThinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
});

const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  toolInvocationId: z.uuid(),
  toolName: z.string(),
  status: ToolInvocationStatusSchema,
  input: z.record(z.string(), z.unknown()),
});

const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolInvocationId: z.uuid(),
  output: z.record(z.string(), z.unknown()).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  creditsCharged: z.number().int().nonnegative().nullable(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .nullable(),
});

const ReasoningBlockSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
});

const CitationBlockSchema = z.object({
  type: z.literal("citation"),
  text: z.string(),
  url: z.url().optional(),
  source: z.string().optional(),
});

const UsageBlockSchema = z.object({
  type: z.literal("usage"),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  model: z.string().optional(),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
  ReasoningBlockSchema,
  CitationBlockSchema,
  UsageBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// Order is semantically meaningful (streamed sequence) — a plain array
// preserves it; JSONB arrays preserve it through persistence too.
export const MessageContentSchema = z.array(ContentBlockSchema);
export type MessageContent = z.infer<typeof MessageContentSchema>;

export const MessageResponseSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  agentRunId: z.uuid().nullable(),
  role: MessageRoleSchema,
  status: MessageStatusSchema,
  content: MessageContentSchema,
  createdAt: z.iso.datetime(),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const PaginatedMessageResponseSchema = cursorPaginationResponse(
  MessageResponseSchema,
);
export type PaginatedMessageResponse = z.infer<
  typeof PaginatedMessageResponseSchema
>;
