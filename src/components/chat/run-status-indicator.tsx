"use client";

import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunActivity, useCancelRun, type ActiveTool, type RunActivity } from "@/hooks/use-run-activity";
import { formatElapsed } from "@/lib/durations";

/** Whole seconds since an ISO timestamp, ticking once a second. */
export function useElapsedSeconds(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - Date.parse(since)) / 1000)) : 0;
}

export { formatElapsed } from "@/lib/durations";

/**
 * One tool call's label for its current phase — the same lifecycle for every
 * tool; the wording comes from the tool's backend-provided display:
 * "Calling {name}…" → "{activity}…" → "Receiving result from {name}…" →
 * "Saving result from {name}…".
 */
export function toolPhaseLabel(tool: Pick<ActiveTool, "display" | "phase">): string {
  const { name, activity } = tool.display;
  switch (tool.phase) {
    case "provider_waiting":
      return `${activity}…`;
    case "receiving":
      return `Receiving result from ${name}…`;
    case "saving":
      return `Saving result from ${name}…`;
    default:
      return `Calling ${name}…`;
  }
}

export type RunStatus = {
  label: string;
  /** Elapsed time counts from here (a real event or run timestamp); absent = not timed. */
  since?: string;
  /** Parallel tool calls: each one's own label and start. */
  tools?: { id: string; label: string; since: string }[];
};

/**
 * The one active-status line for the current run, from real run state and
 * events only: queued → starting → thinking → tool phases (per tool, with
 * the whole call's elapsed time) → writing → waiting for approval →
 * stopping. Labels and timing only — never content or estimated progress.
 * ConversationView hands it to MessageList, which places it before the
 * run's answer.
 */
export function statusOf(
  activity: Pick<RunActivity, "liveStatus" | "currentStep"> & { activeRun?: { createdAt: string } | null },
  stopping: boolean,
): RunStatus {
  const { liveStatus, currentStep } = activity;
  if (stopping) return { label: "Stopping…" };
  if (liveStatus === "WAITING" || currentStep?.kind === "waiting") return { label: "Waiting for your approval" };
  // Queue time counts from the run's admission (its createdAt), not a guess.
  if (liveStatus === "QUEUED") return { label: "Queued…", since: activity.activeRun?.createdAt };
  switch (currentStep?.kind) {
    case "thinking":
      return { label: "Thinking…", since: currentStep.since };
    case "responding":
      return { label: "Writing…" };
    case "tool": {
      const tools = currentStep.tools;
      if (tools.length === 1) return { label: toolPhaseLabel(tools[0]), since: tools[0].since };
      return {
        label: `Running ${tools.length} tools…`,
        tools: tools.map((t) => ({ id: t.toolInvocationId, label: toolPhaseLabel(t), since: t.since })),
      };
    }
    case "working":
      return { label: "Working…" };
    default:
      // RUNNING with no step yet (or only the run's start): preparing the turn.
      return { label: "Starting…" };
  }
}

function Elapsed({ since }: { since: string }) {
  const seconds = useElapsedSeconds(since);
  // The timer ticks every second: kept out of the live region so only stage changes are announced.
  return (
    <span aria-hidden="true" className="tabular-nums">
      {formatElapsed(seconds)}
    </span>
  );
}

export function RunStatusIndicatorView({ chatId, activity }: { chatId: string; activity: RunActivity }) {
  const cancelRun = useCancelRun(chatId);
  const [stoppedRunId, setStoppedRunId] = useState<string | null>(null);
  const { isActive, activeRun } = activity;
  const stopping = !!activeRun && (cancelRun.isPending || stoppedRunId === activeRun.id);
  const status = statusOf(activity, stopping);

  if (!isActive || !activeRun) return null;

  return (
    <div data-run-status="" className="flex w-full min-w-0 items-start gap-2 text-sm text-muted-foreground">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5" role="status" aria-live="polite">
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
          {status.label}
          {status.since && <Elapsed since={status.since} />}
        </span>
        {status.tools && (
          <ul aria-label="Running tools" className="flex flex-col gap-0.5 pl-3 text-xs">
            {status.tools.map((t) => (
              <li key={t.id} data-running-tool="" className="flex items-center gap-1.5">
                {t.label}
                <Elapsed since={t.since} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto gap-1"
        disabled={stopping}
        onClick={() => {
          setStoppedRunId(activeRun.id);
          cancelRun.mutate(activeRun.id, { onError: () => setStoppedRunId(null) });
        }}
      >
        <Square className="size-3" />
        Stop
      </Button>
    </div>
  );
}

/** Standalone form: owns its own realtime subscription. ConversationView
 * shares one subscription instead (RunStatusIndicatorView). */
export function RunStatusIndicator({ chatId }: { chatId: string }) {
  const activity = useRunActivity(chatId);
  return <RunStatusIndicatorView chatId={chatId} activity={activity} />;
}
