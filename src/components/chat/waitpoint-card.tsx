"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { useResolveWaitpoint, useRunWaitpoints, type RunActivity } from "@/hooks/use-run-activity";

function expiresIn(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const hours = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000));
  return hours >= 1 ? `Expires in about ${hours}h` : "Expires soon";
}

/**
 * The approval overlay for the active run's open PLAN waitpoint. Shown
 * only while the server says the run is WAITING and the waitpoint is
 * PENDING, so it clears itself when the decision lands, the waitpoint
 * expires, or the run is stopped — and it survives a reload (REST).
 * The plan itself is the assistant message above; this is the decision.
 */
export function WaitpointCard({ chatId, activity }: { chatId: string; activity: RunActivity }) {
  const runId = activity.activeRun?.id;
  const waiting = activity.liveStatus === "WAITING";
  const waitpoints = useRunWaitpoints(chatId, runId, waiting);
  const resolve = useResolveWaitpoint(chatId, runId);
  const [note, setNote] = useState("");

  const pending = waiting ? waitpoints.data?.items.find((w) => w.status === "PENDING" && w.type === "PLAN") : undefined;
  if (!pending) return null;

  const error = resolve.error;
  const errorText =
    error instanceof ApiError ? error.message : error ? "Couldn't send your decision. Try again." : null;
  const decide = (decision: "approve" | "reject") =>
    resolve.mutate({
      waitpointId: pending.id,
      decision: { decision, ...(decision === "approve" && note.trim() ? { note: note.trim() } : {}) },
    });

  return (
    <section aria-label="Plan approval" className="border-t bg-background px-3 py-2">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Approve this plan?</span>
          <span className="text-xs text-muted-foreground">{expiresIn(pending.expiresAt)}</span>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the agent"
          aria-label="Optional note for the agent"
          maxLength={2000}
          disabled={resolve.isPending}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={resolve.isPending} onClick={() => decide("approve")}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => decide("reject")}>
            Reject
          </Button>
          {errorText && (
            <p role="alert" className="text-xs text-destructive">
              {errorText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
