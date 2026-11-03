// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

import { z } from "zod";
import { enumSchema } from "./enum-schema";
import { CreditLedgerType } from "./prisma-enums";
import { cursorPaginationResponse } from "./pagination";

export const CreditLedgerTypeSchema = enumSchema(CreditLedgerType);

// Credit amounts are BigInt in Postgres/Prisma (exact arithmetic, no float
// drift) but plain numbers at the API boundary — JSON has no BigInt type,
// and credit values stay far below Number.MAX_SAFE_INTEGER. The
// BigInt -> Number conversion happens in the service layer, not here.
//
// Unit: raw integer credits — exactly Magica's integer unit (its
// `estimate-credits` "microcredits", a run's `creditUsed`, its account
// `availableBalance`). These values are authoritative and are never scaled
// in storage or settlement. Display only: divide by 1,000,000 and show an
// "M" suffix (e.g. 273936 → "0.27M"), matching Magica's own formatting.
// Ledger sign: positive adds credits (GRANT/REFUND), negative removes them
// (TOOL_CHARGE); `balanceAfter` is the balance after that entry.

export const CreditBalanceResponseSchema = z.object({
  balance: z.number().int(),
});
export type CreditBalanceResponse = z.infer<typeof CreditBalanceResponseSchema>;

export const CreditLedgerEntrySchema = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  type: CreditLedgerTypeSchema,
  balanceAfter: z.number().int(),
  description: z.string(),
  toolInvocationId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>;

export const PaginatedCreditLedgerResponseSchema = cursorPaginationResponse(
  CreditLedgerEntrySchema,
);
export type PaginatedCreditLedgerResponse = z.infer<
  typeof PaginatedCreditLedgerResponseSchema
>;
