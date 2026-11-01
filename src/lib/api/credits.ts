import { apiFetch, toQueryString } from "./client";
import {
  CreditBalanceResponseSchema,
  PaginatedCreditLedgerResponseSchema,
  type CreditBalanceResponse,
  type PaginatedCreditLedgerResponse,
} from "./contracts";

export async function getBalance(token: string | null): Promise<CreditBalanceResponse> {
  const data = await apiFetch<unknown>("/api/v1/credits/balance", { token });
  return CreditBalanceResponseSchema.parse(data);
}

export async function listLedger(
  token: string | null,
  params: { cursor?: string; limit?: number } = {},
): Promise<PaginatedCreditLedgerResponse> {
  const qs = toQueryString(params);
  const data = await apiFetch<unknown>(`/api/v1/credits/ledger${qs}`, { token });
  return PaginatedCreditLedgerResponseSchema.parse(data);
}
