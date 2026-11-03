"use client";

import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunActivity, useCancelRun, type RunActivity } from "@/hooks/use-run-activity";

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

/** "42s", "3m 05s". */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Stage labels for known tools: while starting/running, and once the provider has the job. */
const TOOL_LABELS: Record<string, { running: string; providerWaiting: string }> = {
  generate_image: { running: "Generating image…", providerWaiting: "Waiting for image…" },
  edit_image: { running: "Editing image…", providerWaiting: "Waiting for edited image…" },
  crop_image: { running: "Cropping image…", providerWaiting: "Waiting for cropped image…" },
  merge_videos: { running: "Merging videos…", providerWaiting: "Waiting for merged video…" },
  load_skill: { running: "Loading skill…", providerWaiting: "Loading skill…" },
  read_skill_asset: { running: "Reading skill guide…", providerWaiting: "Reading skill guide…" },
};

function toolLabel(toolName: string, phase: "running" | "provider_waiting"): string {
  const labels = TOOL_LABELS[toolName];
  if (!labels) return `Running ${toolName}…`;
  return phase === "provider_waiting" ? labels.providerWaiting : labels.running;
}

/**
 * The one active-status line for the current run: thinking → tool stage
 * (with the whole call's elapsed time) → writing → waiting for approval →
 * stopping. Labels and timing only — never content. The message itself
 * (including streamed text) is rendered by MessageList, which shows no
 * status text of its own.
 */
export function statusOf(
  activity: Pick<RunActivity, "liveStatus" | "currentStep">,
  stopping: boolean,
): { label: string; timed: boolean } {
  const { liveStatus, currentStep } = activity;
  if (stopping) return { label: "Stopping…", timed: false };
  if (liveStatus === "WAITING" || currentStep?.kind === "waiting") return { label: "Waiting for your approval", timed: false };
  if (liveStatus === "QUEUED") return { label: "Queued…", timed: false };
  switch (currentStep?.kind) {
    case "thinking":
      return { label: "Thinking…", timed: true };
    case "responding":
      return { label: "Writing…", timed: false };
    case "tool":
      return { label: toolLabel(currentStep.toolName, currentStep.phase), timed: true };
    case "working":
      return { label: "Working…", timed: false };
    default:
      return { label: "Thinking…", timed: false };
  }
}

export function RunStatusIndicatorView({ chatId, activity }: { chatId: string; activity: RunActivity }) {
  const cancelRun = useCancelRun(chatId);
  const [stoppedRunId, setStoppedRunId] = useState<string | null>(null);
  const { isActive, activeRun, currentStep } = activity;
  const stopping = !!activeRun && (cancelRun.isPending || stoppedRunId === activeRun.id);
  const status = statusOf(activity, stopping);
  const elapsedSeconds = useElapsedSeconds(status.timed && currentStep ? currentStep.since : null);

  if (!isActive || !activeRun) return null;

  return (
    <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5" role="status" aria-live="polite">
        <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
        {status.label}
        {/* The timer ticks every second: kept out of the live region so only stage changes are announced. */}
        {status.timed && (
          <span aria-hidden="true" className="tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
        )}
      </span>
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
