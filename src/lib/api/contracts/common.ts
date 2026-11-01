// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

/**
 * Standard envelope for a successful response. `data` is supplied per
 * endpoint by wrapping this generic with `.extend()` or by composing a
 * dedicated response schema — this file only defines the shared shape.
 */
export function successResponse<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
  });
}

/**
 * Standard error envelope. `code` is a stable machine-readable string the
 * frontend can switch on; `message` is safe to show the user as-is (never
 * a stack trace or internal detail — see security-and-secrets rules).
 */
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    traceId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
