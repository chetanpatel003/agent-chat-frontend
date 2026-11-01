// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";

export const AuthenticatedUserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  imageUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuthenticatedUserResponse = z.infer<
  typeof AuthenticatedUserResponseSchema
>;
