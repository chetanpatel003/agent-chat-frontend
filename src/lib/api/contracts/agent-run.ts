// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { enumSchema } from "./enum-schema";
import {
  AgentRunStatus,
  ToolInvocationStatus,
  WaitpointStatus,
} from "./prisma-enums";

export const AgentRunStatusSchema = enumSchema(AgentRunStatus);
export const ToolInvocationStatusSchema = enumSchema(ToolInvocationStatus);
export const WaitpointStatusSchema = enumSchema(WaitpointStatus);
