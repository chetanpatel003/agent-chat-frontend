// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

// REST Magica tool execution (assessment: versioned routes for "Magica tool
// execution"). Runs one media tool without the model, as an ordinary run of
// the chat: same validation, credit admission, settlement and recovery.
export const DIRECT_TOOL_NAMES = ["generate_image", "edit_image", "crop_image", "merge_videos"] as const;

export const ToolRunRequestSchema = z.object({
  tool: z.enum(DIRECT_TOOL_NAMES),
  /** Validated against the tool's own input schema. */
  input: z.record(z.string(), z.unknown()),
});
export type ToolRunRequest = z.infer<typeof ToolRunRequestSchema>;
