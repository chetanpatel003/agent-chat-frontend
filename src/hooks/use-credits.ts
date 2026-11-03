"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getBalance, listLedger } from "@/lib/api/credits";

export const CREDIT_BALANCE_KEY = ["credits", "balance"] as const;

export function useCreditBalance() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: CREDIT_BALANCE_KEY,
    queryFn: async () => getBalance(await getToken()),
    enabled: isSignedIn === true,
  });
}

export function useCreditLedger(opts: { limit?: number } = {}) {
  const { getToken, isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: ["credits", "ledger"],
    queryFn: async ({ pageParam }) =>
      listLedger(await getToken(), { cursor: pageParam, limit: opts.limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isSignedIn === true,
  });
}
