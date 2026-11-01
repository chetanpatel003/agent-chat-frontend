// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

// Opaque cursor: base64url(JSON.stringify({ sortKey, id })). Callers never
// construct or parse this themselves — it's a token, not a structured input.
// `sortKey` is the ISO value of whatever column a given list orders by
// (Message/CreditLedger: createdAt; Chat: lastMessageAt) — one codec for
// every (sortColumn, id) keyset-paginated list, not three near-identical
// ones. Validated as "any non-empty string decodable by the service
// layer"; the service layer rejects a cursor that doesn't decode or
// doesn't match the expected shape with a 400, not a 500.
export const CursorPaginationRequestSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorPaginationRequest = z.infer<
  typeof CursorPaginationRequestSchema
>;

export function cursorPaginationResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

/** Encode/decode the opaque cursor. Shared so request and response sides,
 * and every service that paginates by (sortKey, id), agree on the format. */
export const CursorPayloadSchema = z.object({
  sortKey: z.iso.datetime(),
  id: z.uuid(),
});
export type CursorPayload = z.infer<typeof CursorPayloadSchema>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = CursorPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
