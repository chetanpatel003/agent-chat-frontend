"use client";

import { Coins } from "lucide-react";
import { useCreditBalance } from "@/hooks/use-credits";
import { exactCredits, formatCredits } from "@/lib/credits";
import { cn } from "@/lib/utils";

/**
 * The signed-in user's Magica credit balance (application credits, not
 * model tokens — OpenRouter Free turns cost nothing here). Refreshed when
 * a run's billable tool settles (see use-run-activity.ts) and on window
 * focus. Loading and error states stay compact so the header never jumps.
 */
export function CreditBalance({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useCreditBalance();

  const base = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums",
    className,
  );

  if (isLoading) {
    return (
      <span className={cn(base, "text-muted-foreground")} aria-live="polite">
        <Coins className="size-3.5" aria-hidden="true" />
        <span className="h-3 w-10 animate-pulse rounded bg-muted" />
        <span className="sr-only">Loading credit balance</span>
      </span>
    );
  }
  if (isError || !data) {
    return (
      <button
        type="button"
        className={cn(base, "text-muted-foreground hover:bg-muted")}
        onClick={() => void refetch()}
        title="Could not load your credit balance. Click to retry."
      >
        <Coins className="size-3.5" aria-hidden="true" />
        Credits unavailable
      </button>
    );
  }
  return (
    <span className={base} title={exactCredits(data.balance)} aria-label={`Credit balance: ${exactCredits(data.balance)}`}>
      <Coins className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {formatCredits(data.balance)} credits
    </span>
  );
}
