// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

/** Derive a Zod enum from a Prisma-generated const-object enum, so the
 * allowed values have exactly one source of truth. */
export function enumSchema<T extends Record<string, string>>(obj: T) {
  return z.enum(Object.values(obj) as [string, ...string[]]);
}
