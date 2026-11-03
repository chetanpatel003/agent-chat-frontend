// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

// Token-level assistant text, delivered on its own Trigger.dev realtime
// stream — separate from run metadata (contracts/run-event.ts), per the
// assessment's "stream text separately from run metadata". Transport only:
// the persisted Message is the durable copy and always wins once the
// message is terminal. Visible output text only; reasoning never streams.

export const ASSISTANT_TEXT_STREAM_KEY = "assistant-text";

export const TextStreamPartSchema = z.strictObject({
  /** The pending assistant message this text belongs to. */
  messageId: z.uuid(),
  /** Zero-based model round within the turn; each round's text is a separate paragraph. */
  round: z.number().int().nonnegative(),
  delta: z.string(),
});
export type TextStreamPart = z.infer<typeof TextStreamPartSchema>;
