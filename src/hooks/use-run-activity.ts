"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { getActiveRun, getRealtimeToken, cancelRun, listWaitpoints, resolveWaitpoint } from "@/lib/api/runs";
import {
  ASSISTANT_TEXT_STREAM_KEY,
  RunEventSchema,
  TextStreamPartSchema,
  type PlanResolution,
  type RunEvent,
  type ToolDisplay,
  type ToolProgressPhase,
} from "@/lib/api/contracts";

import { CREDIT_BALANCE_KEY } from "./use-credits";
import { fallbackToolDisplay } from "@/lib/tool-display";

/**
 * Each event is validated on its own: one malformed or unknown event (e.g.
 * from a newer server during a deploy) is dropped instead of discarding the
 * whole history and blanking the status line.
 */
export function parseRunEvents(raw: unknown): RunEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const parsed = RunEventSchema.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

const NON_TERMINAL_STATUSES = new Set(["QUEUED", "RUNNING", "WAITING"]);

function highestSeq<T extends RunEvent>(events: T[]): T | null {
  return events.reduce<T | null>((best, e) => (best === null || e.seq > best.seq ? e : best), null);
}

function activeRunKey(chatId: string | undefined) {
  return ["active-run", chatId] as const;
}

/** REST fallback cadence while a run is active. Realtime is the fast path;
 * if its transport dies (observed: the long-poll stopped and never
 * resubscribed), this is what still notices the run has ended. */
export const ACTIVE_RUN_FALLBACK_POLL_MS = 15_000;

/** Poll only while something is in flight; idle chats are never polled. */
export function activeRunRefetchInterval(activeRun: unknown): number | false {
  return activeRun ? ACTIVE_RUN_FALLBACK_POLL_MS : false;
}

/**
 * REST reconciliation — the one source of truth for "is something in
 * flight for this chat." Fetched on mount/chat-change, whenever something
 * (a send, a cancel, a realtime terminal event) invalidates it, and — only
 * while a run is active — every ACTIVE_RUN_FALLBACK_POLL_MS as a fallback
 * for a failed realtime transport.
 */
export function useActiveRun(chatId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: activeRunKey(chatId),
    queryFn: async () => getActiveRun(await getToken(), chatId as string),
    enabled: isSignedIn === true && !!chatId,
    refetchInterval: (query) => activeRunRefetchInterval(query.state.data),
  });
}

/**
 * The realtime layer. Subscribes only once REST reconciliation has
 * found an active run with a triggerRunId (the brief pre-dispatch
 * window where it's still null simply means no subscription starts
 * yet — the next natural refetch of useActiveRun picks it up).
 *
 * Realtime is transport only: every event here either (a) updates a
 * purely cosmetic "what's happening right now" indicator, or (b)
 * invalidates the real REST queries (messages, active-run) so the
 * persisted database state is what actually gets displayed. No event
 * payload is ever rendered as message content.
 */
export function useRunActivity(chatId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const activeRunQuery = useActiveRun(chatId);
  const activeRun = activeRunQuery.data ?? null;
  const agentRunId = activeRun?.id;
  const triggerRunId = activeRun?.triggerRunId ?? undefined;

  const tokenKey = ["realtime-token", chatId, agentRunId] as const;
  const tokenQuery = useQuery({
    queryKey: tokenKey,
    queryFn: async () => getRealtimeToken(await getToken(), chatId as string, agentRunId as string),
    enabled: isSignedIn === true && !!chatId && !!agentRunId && !!triggerRunId,
    staleTime: 50 * 60 * 1000, // tokens are minted with a 1h expiration server-side
  });

  const refreshAccessToken = useCallback(async () => {
    const result = await queryClient.fetchQuery({
      queryKey: tokenKey,
      queryFn: async () => getRealtimeToken(await getToken(), chatId as string, agentRunId as string),
    });
    return result.token;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokenKey is derived from chatId/agentRunId, already covered
  }, [queryClient, chatId, agentRunId, getToken]);

  // One subscription per run: metadata events plus the separate
  // assistant-text stream (token deltas). Both are transport only.
  // Stream parts are validated in toLiveText, so the default (untyped) streams shape is fine here.
  const { run, streams } = useRealtimeRunWithStreams(triggerRunId, {
    accessToken: tokenQuery.data?.token,
    enabled: !!triggerRunId && !!tokenQuery.data?.token,
    refreshAccessToken,
  });

  // metadata.events arrives as the FULL accumulated array on every push,
  // and `seq` is unique per AgentRun across retry attempts. Identity
  // (dedup) and ordering (latest state) are handled separately below.
  const events = useMemo(
    () => parseRunEvents(run?.metadata?.events ?? []).filter((e) => e.runId === agentRunId),
    [run?.metadata?.events, agentRunId],
  );

  // Dedup: the set of seqs already acted on, scoped to one run. A late,
  // lower-seq event is still processed once; nothing is processed twice.
  const runKey = `${agentRunId ?? ""}:${triggerRunId ?? ""}`;
  const processed = useRef<{ runKey: string; seqs: Set<number> }>({ runKey, seqs: new Set() });

  useEffect(() => {
    if (processed.current.runKey !== runKey) processed.current = { runKey, seqs: new Set() };
    const seen = processed.current.seqs;
    const unseen = events.filter((e) => !seen.has(e.seq));
    if (unseen.length === 0) return;
    for (const e of unseen) seen.add(e.seq);

    const shouldRefetchMessages = unseen.some(
      (e) =>
        // A step event means the pending assistant message exists (it is
        // created before the first model call): fetch it so the streaming
        // bubble has a message to render into, and the plan shows while waiting.
        e.type === "step" ||
        e.type === "assistant_message" ||
        e.type === "tool_completed" ||
        e.type === "tool_failed" ||
        (e.type === "run_status" && !NON_TERMINAL_STATUSES.has(e.status)),
    );
    if (shouldRefetchMessages) {
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    }
    // Billable calls settle right after tool_completed/tool_failed, before
    // the turn's next step; a terminal status covers the last call.
    if (
      unseen.some(
        (e) =>
          e.type === "step" ||
          e.type === "tool_completed" ||
          e.type === "tool_failed" ||
          (e.type === "run_status" && !NON_TERMINAL_STATUSES.has(e.status)),
      )
    ) {
      void queryClient.invalidateQueries({ queryKey: CREDIT_BALANCE_KEY });
    }
    // A new chat's title is generated alongside its first turn (backend
    // generate-chat-title task) and is normally ready by the reply: refresh
    // the sidebar when the reply lands and when the run ends.
    if (
      unseen.some(
        (e) => e.type === "assistant_message" || (e.type === "run_status" && !NON_TERMINAL_STATUSES.has(e.status)),
      )
    ) {
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
    if (unseen.some((e) => e.type === "waitpoint")) {
      void queryClient.invalidateQueries({ queryKey: waitpointsKey(chatId, agentRunId) });
    }
  }, [events, runKey, chatId, agentRunId, queryClient]);

  // REST fallback: when the active run disappears (ended) without realtime
  // having told us — e.g. the realtime transport died — reload messages so
  // the pending assistant bubble resolves from the persisted state.
  const previousAgentRunId = useRef(agentRunId);
  useEffect(() => {
    const ended = previousAgentRunId.current !== undefined && agentRunId !== previousAgentRunId.current;
    previousAgentRunId.current = agentRunId;
    if (!ended) return;
    void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    void queryClient.invalidateQueries({ queryKey: CREDIT_BALANCE_KEY });
  }, [agentRunId, chatId, queryClient]);

  // Belt-and-suspenders: Trigger.dev's own terminal signal (in case our
  // application-level run_status event was somehow never emitted, e.g.
  // a crash right at the end) also triggers one final reconciliation.
  const isTerminal = run?.isCompleted || run?.isFailed || run?.isCancelled;
  useEffect(() => {
    if (!isTerminal) return;
    void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    void queryClient.invalidateQueries({ queryKey: activeRunKey(chatId) });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
    void queryClient.invalidateQueries({ queryKey: CREDIT_BALANCE_KEY });
  }, [isTerminal, chatId, queryClient]);

  // Ordering: latest = highest seq, never array position, so an older
  // event can't overwrite newer state however it was delivered.
  const latestToolEvent = useMemo(
    () => highestSeq(events.filter((e) => e.type === "tool_started" || e.type === "tool_completed" || e.type === "tool_failed")),
    [events],
  );
  const latestRunStatusEvent = useMemo(
    () => highestSeq(events.filter((e): e is Extract<RunEvent, { type: "run_status" }> => e.type === "run_status")),
    [events],
  );

  const currentStep = useMemo(() => toCurrentStep(events), [events]);
  const liveText = useMemo(() => toLiveText(streams?.[ASSISTANT_TEXT_STREAM_KEY]), [streams]);

  // Ended as soon as either realtime signal says so — the active-run query
  // catches up a moment later, and no stale indicator shows meanwhile.
  const ended =
    (latestRunStatusEvent !== null && !NON_TERMINAL_STATUSES.has(latestRunStatusEvent.status)) ||
    (!!isTerminal && run?.id === triggerRunId); // never a previous run's terminal state

  return {
    activeRun,
    isActive: !!activeRun && !ended,
    liveStatus: latestRunStatusEvent?.status ?? activeRun?.status ?? null,
    toolActivity: latestToolEvent,
    currentStep,
    liveText,
  };
}

export type RunActivity = ReturnType<typeof useRunActivity>;

/** A tool call's live phase: `calling` until the tool reports otherwise (see contracts/run-event.ts). */
export type ToolPhase = "calling" | ToolProgressPhase;

/** One tool call in flight. */
export type ActiveTool = {
  toolInvocationId: string;
  toolName: string;
  /** Backend-provided name and activity label (falls back to one derived from the tool name). */
  display: ToolDisplay;
  phase: ToolPhase;
  /** When this tool call started (elapsed time counts the whole call). */
  since: string;
};

/** What the agent is doing now — labels and timing only, never content. */
export type CurrentStep =
  | { kind: "starting" | "thinking" | "responding" | "waiting" | "working"; since: string }
  /** One or more tool calls in flight (several when non-billable calls run in parallel), in start order. */
  | { kind: "tool"; tools: ActiveTool[]; since: string };


/**
 * The current step, derived only from real events (ordered by `seq`, never
 * by arrival or elapsed time):
 * - Tool calls started after the latest boundary (a model step, or a
 *   `run_status: RUNNING` that begins an execution attempt) and not yet
 *   completed/failed are in flight, each in its latest reported phase. A
 *   retry attempt's RUNNING is a boundary, so a call stranded by a crashed
 *   attempt is never shown as still running.
 * - Otherwise the latest step/tool event decides; a RUNNING run with no step
 *   yet is "starting".
 */
export function toCurrentStep(events: RunEvent[]): CurrentStep | null {
  const boundary = highestSeq(
    events.filter((e) => e.type === "step" || (e.type === "run_status" && e.status === "RUNNING")),
  );
  const boundarySeq = boundary?.seq ?? -1;

  const finished = new Set(
    events.filter((e) => e.type === "tool_completed" || e.type === "tool_failed").map((e) => e.toolInvocationId),
  );
  const tools: ActiveTool[] = events
    .filter((e): e is Extract<RunEvent, { type: "tool_started" }> => e.type === "tool_started")
    .filter((e) => e.seq > boundarySeq && !finished.has(e.toolInvocationId))
    .sort((a, b) => a.seq - b.seq)
    .map((started) => {
      const progress = highestSeq(
        events.filter(
          (e): e is Extract<RunEvent, { type: "tool_progress" }> =>
            e.type === "tool_progress" && e.toolInvocationId === started.toolInvocationId,
        ),
      );
      return {
        toolInvocationId: started.toolInvocationId,
        toolName: started.toolName,
        display: started.display ?? fallbackToolDisplay(started.toolName),
        phase: progress?.phase ?? "calling",
        since: started.at,
      };
    });
  if (tools.length > 0) return { kind: "tool", tools, since: tools[0].since };

  const latest = highestSeq(
    events.filter((e) => e.type === "step" || e.type === "tool_started" || e.type === "tool_completed" || e.type === "tool_failed"),
  );
  if (latest && latest.seq > boundarySeq) return { kind: "working", since: latest.at }; // a tool just finished
  if (latest?.type === "step" && latest.seq === boundarySeq) return { kind: latest.step, since: latest.at };
  if (boundary?.type === "run_status") return { kind: "starting", since: boundary.at };
  if (latest?.type === "step") return { kind: latest.step, since: latest.at };
  return latest ? { kind: "working", since: latest.at } : null;
}

/** Streamed text for the in-flight assistant message, one entry per model round. */
export type LiveText = { messageId: string; rounds: string[] };

/** Parts arrive as the full accumulated array; invalid parts are ignored.
 * Only the most recent message's text is kept. */
export function toLiveText(rawParts: unknown[] | undefined): LiveText | null {
  let live: LiveText | null = null;
  for (const raw of rawParts ?? []) {
    const parsed = TextStreamPartSchema.safeParse(raw);
    if (!parsed.success) continue;
    const part = parsed.data;
    if (!live || live.messageId !== part.messageId) live = { messageId: part.messageId, rounds: [] };
    live.rounds[part.round] = (live.rounds[part.round] ?? "") + part.delta;
  }
  if (live) live.rounds = Array.from(live.rounds, (text) => text ?? "");
  return live;
}

function waitpointsKey(chatId: string | undefined, runId: string | undefined) {
  return ["waitpoints", chatId, runId] as const;
}

/** A run's waitpoints — fetched while it is WAITING (and refetched on
 * waitpoint events), so a reloaded page restores an open approval. */
export function useRunWaitpoints(chatId: string | undefined, runId: string | undefined, enabled: boolean) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: waitpointsKey(chatId, runId),
    queryFn: async () => listWaitpoints(await getToken(), chatId as string, runId as string),
    enabled: enabled && isSignedIn === true && !!chatId && !!runId,
  });
}

export function useResolveWaitpoint(chatId: string | undefined, runId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ waitpointId, decision }: { waitpointId: string; decision: PlanResolution }) =>
      resolveWaitpoint(await getToken(), chatId as string, runId as string, waitpointId, decision),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: waitpointsKey(chatId, runId) });
      void queryClient.invalidateQueries({ queryKey: activeRunKey(chatId) });
    },
  });
}

function invalidateAfterCancel(queryClient: QueryClient, chatId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: activeRunKey(chatId) });
  void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
}

export function useCancelRun(chatId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => cancelRun(await getToken(), chatId as string, runId),
    onSuccess: () => invalidateAfterCancel(queryClient, chatId),
  });
}
