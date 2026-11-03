// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({ useRealtimeRunWithStreams: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { createTestQueryClient, createWrapper } from "@/test-utils/query-wrapper";
import {
  ACTIVE_RUN_FALLBACK_POLL_MS,
  activeRunRefetchInterval,
  useActiveRun,
  useRunActivity,
  useCancelRun,
} from "./use-run-activity";
import type { AgentRunResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const mockUseAuth = vi.mocked(useAuth);
const mockUseRealtimeRun = vi.mocked(useRealtimeRunWithStreams);
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, only getToken/isSignedIn are used
  } as any);
  mockUseRealtimeRun.mockReturnValue({ run: undefined, streams: {}, error: undefined, stop: vi.fn() });
});

function makeRun(overrides: Partial<AgentRunResponse> = {}): AgentRunResponse {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    status: "RUNNING",
    waitingReason: null,
    model: null,
    promptTokens: null,
    completionTokens: null,
    turnCount: 1,
    planMode: false,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    triggerRunId: `run_${randomUUID()}`,
    ...overrides,
  };
}

function okRun(run: AgentRunResponse | null) {
  return HttpResponse.json({ ok: true, data: run });
}

function runEvent(runId: string, overrides: Record<string, unknown>) {
  return { runId, at: new Date().toISOString(), ...overrides };
}

const status = (runId: string, seq: number, s: string) => runEvent(runId, { type: "run_status", seq, status: s });
const tool = (runId: string, seq: number, type: string, toolName: string) =>
  runEvent(runId, { type, seq, toolInvocationId: randomUUID(), toolName });

function realtime(events: unknown[], terminal: Partial<Record<"isCompleted" | "isFailed" | "isCancelled", boolean>> = {}) {
  return {
    run: { status: "EXECUTING", isCompleted: false, isFailed: false, isCancelled: false, ...terminal, metadata: { events } },
    error: undefined,
    streams: {},
    stop: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial RealtimeRun test double
  } as any;
}

function serveActive(chatId: string, getRun: () => AgentRunResponse) {
  server.use(
    http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () => okRun(getRun())),
    http.get(`${API}/api/v1/chats/${chatId}/runs/:runId/realtime-token`, () =>
      HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
    ),
  );
}

function messageInvalidations(spy: { mock: { calls: unknown[][] } }, chatId: string) {
  return spy.mock.calls.filter(([arg]) => JSON.stringify(arg) === JSON.stringify({ queryKey: ["messages", chatId] })).length;
}

describe("useActiveRun", () => {
  it("returns null when nothing is active for the chat", async () => {
    const chatId = randomUUID();
    server.use(http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () => okRun(null)));

    const { result } = renderHook(() => useActiveRun(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns the active run including its triggerRunId", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId, status: "QUEUED" });
    server.use(http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () => okRun(run)));

    const { result } = renderHook(() => useActiveRun(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(run);
  });

  it("polls as a REST fallback only while a run is active", () => {
    expect(activeRunRefetchInterval(makeRun())).toBe(ACTIVE_RUN_FALLBACK_POLL_MS);
    expect(ACTIVE_RUN_FALLBACK_POLL_MS).toBe(15_000);
    expect(activeRunRefetchInterval(null)).toBe(false);
    expect(activeRunRefetchInterval(undefined)).toBe(false);
  });
});

describe("useRunActivity — realtime transport failure (regression)", () => {
  afterEach(() => vi.useRealTimers());

  it("notices the run ended via the REST fallback and reloads messages, with realtime completely silent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    let current: AgentRunResponse | null = run;
    let activeFetches = 0;
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () => {
        activeFetches++;
        return okRun(current);
      }),
      http.get(`${API}/api/v1/chats/${chatId}/runs/:runId/realtime-token`, () =>
        HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
      ),
    );
    // The dead transport: the realtime hook never delivers anything.
    mockUseRealtimeRun.mockReturnValue({ run: undefined, streams: {}, error: undefined, stop: vi.fn() });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.isActive).toBe(true));
    const fetchesWhileActive = activeFetches;

    current = null; // the run finished on the server
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_RUN_FALLBACK_POLL_MS + 100);
    });

    await waitFor(() => expect(result.current.isActive).toBe(false));
    expect(activeFetches).toBeGreaterThan(fetchesWhileActive);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["messages", chatId] });

    // Idle now: no further polling.
    const fetchesWhenIdle = activeFetches;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_RUN_FALLBACK_POLL_MS * 3);
    });
    expect(activeFetches).toBe(fetchesWhenIdle);
  });
});

describe("useRunActivity — event processing", () => {
  it("surfaces the latest run_status and tool event", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(
      realtime([status(run.id, 1, "RUNNING"), tool(run.id, 2, "tool_started", "generate_image")]),
    );

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("generate_image"));
    expect(result.current.toolActivity?.type).toBe("tool_started");
    expect(result.current.liveStatus).toBe("RUNNING");
  });

  it("ignores another AgentRun's events in the same metadata", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(
      realtime([tool(run.id, 1, "tool_started", "mine"), tool(randomUUID(), 9, "tool_started", "other")]),
    );

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("mine"));
  });

  it("applies retry-attempt events after first-attempt events — retry seqs continue rather than restart, so none are discarded", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    const attempt1 = [status(run.id, 1, "RUNNING"), tool(run.id, 2, "tool_started", "first"), tool(run.id, 3, "tool_failed", "first")];
    mockUseRealtimeRun.mockReturnValue(realtime(attempt1));

    const { result, rerender } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.toolActivity?.type).toBe("tool_failed"));
    const before = messageInvalidations(spy, chatId);

    const attempt2 = [status(run.id, 4, "RUNNING"), tool(run.id, 5, "tool_started", "retry"), tool(run.id, 6, "tool_completed", "retry")];
    mockUseRealtimeRun.mockReturnValue(realtime([...attempt1, ...attempt2]));
    rerender();

    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("retry"));
    expect(result.current.toolActivity?.type).toBe("tool_completed");
    expect(result.current.liveStatus).toBe("RUNNING");
    expect(messageInvalidations(spy, chatId)).toBe(before + 1);
  });

  it("does not process the same snapshot twice (duplicate delivery, e.g. a reconnect replay)", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    const events = [tool(run.id, 1, "tool_completed", "generate_image")];
    mockUseRealtimeRun.mockReturnValue(realtime(events));

    const { result, rerender } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.toolActivity?.type).toBe("tool_completed"));
    await waitFor(() => expect(messageInvalidations(spy, chatId)).toBe(1));

    mockUseRealtimeRun.mockReturnValue(realtime([...events]));
    rerender();
    await act(async () => {});
    expect(messageInvalidations(spy, chatId)).toBe(1);
  });

  it("picks the highest-seq tool event when delivery is out of order", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(
      realtime([tool(run.id, 1, "tool_started", "a"), tool(run.id, 3, "tool_started", "b"), tool(run.id, 2, "tool_started", "c")]),
    );

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("b"));
  });

  it("processes a late lower-seq event exactly once without letting it overwrite newer state", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    const newer = tool(run.id, 3, "tool_completed", "newer");
    mockUseRealtimeRun.mockReturnValue(realtime([newer]));

    const { result, rerender } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(messageInvalidations(spy, chatId)).toBe(1));

    mockUseRealtimeRun.mockReturnValue(realtime([newer, tool(run.id, 2, "tool_completed", "late")]));
    rerender();
    await waitFor(() => expect(messageInvalidations(spy, chatId)).toBe(2));
    expect(result.current.toolActivity?.toolName).toBe("newer");

    rerender();
    await act(async () => {});
    expect(messageInvalidations(spy, chatId)).toBe(2);
  });

  it("keeps the newer status when an older status arrives after it", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(realtime([status(run.id, 5, "WAITING"), status(run.id, 3, "RUNNING")]));

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.liveStatus).toBe("WAITING"));
  });

  it("resets dedup state when the active AgentRun changes, so the next run's seq 1 is processed", async () => {
    const chatId = randomUUID();
    const runA = makeRun({ chatId });
    const runB = makeRun({ chatId });
    let current = runA;
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => current);
    mockUseRealtimeRun.mockImplementation((id) =>
      id === runA.triggerRunId
        ? realtime([tool(runA.id, 1, "tool_completed", "from-a")])
        : realtime([tool(runB.id, 1, "tool_completed", "from-b")]),
    );

    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("from-a"));
    const before = messageInvalidations(spy, chatId);

    current = runB;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["active-run", chatId] });
    });
    await waitFor(() => expect(result.current.toolActivity?.toolName).toBe("from-b"));
    // One for run A ending (REST fallback), one for run B's seq-1 event (dedup was reset).
    expect(messageInvalidations(spy, chatId)).toBe(before + 2);
  });

  it("invalidates messages and active-run when the run reaches a terminal state", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(realtime([status(run.id, 1, "COMPLETED")], { isCompleted: true }));

    renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["messages", chatId] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["active-run", chatId] });
    // Settlement happens inside the turn, so the header balance refreshes too.
    expect(spy).toHaveBeenCalledWith({ queryKey: ["credits", "balance"] });
  });

  it("refreshes the chat list (for a newly generated title) when the reply lands and when the run ends", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(
      realtime([runEvent(run.id, { type: "assistant_message", seq: 1, messageId: randomUUID(), status: "COMPLETE" })]),
    );
    const { rerender } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["chats"] }));
    const afterReply = spy.mock.calls.filter(([a]) => JSON.stringify(a) === JSON.stringify({ queryKey: ["chats"] })).length;

    mockUseRealtimeRun.mockReturnValue(
      realtime([
        runEvent(run.id, { type: "assistant_message", seq: 1, messageId: randomUUID(), status: "COMPLETE" }),
        status(run.id, 2, "COMPLETED"),
      ]),
    );
    rerender();
    await waitFor(() =>
      expect(spy.mock.calls.filter(([a]) => JSON.stringify(a) === JSON.stringify({ queryKey: ["chats"] })).length).toBeGreaterThan(afterReply),
    );
  });

  it("refreshes the credit balance after a tool call finishes (billable calls settle there)", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(realtime([tool(run.id, 1, "tool_completed", "generate_image")]));

    renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["credits", "balance"] }));
  });
});

describe("useRunActivity — no stale active indicator", () => {
  it("is inactive as soon as a terminal run_status arrives, before the active-run query catches up", async () => {
    for (const terminal of ["COMPLETED", "FAILED", "CANCELLED"]) {
      const chatId = randomUUID();
      const run = makeRun({ chatId });
      serveActive(chatId, () => run); // REST still reports the run as active
      mockUseRealtimeRun.mockReturnValue(
        realtime([status(run.id, 1, "RUNNING"), tool(run.id, 2, "tool_started", "generate_image"), status(run.id, 3, terminal)]),
      );
      const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(createTestQueryClient()) });
      await waitFor(() => expect(result.current.activeRun?.id).toBe(run.id));
      expect(result.current.isActive).toBe(false);
    }
  });

  it("a late, lower-seq RUNNING never revives an ended run", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(realtime([status(run.id, 5, "COMPLETED"), status(run.id, 2, "RUNNING")]));
    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(createTestQueryClient()) });
    await waitFor(() => expect(result.current.activeRun?.id).toBe(run.id));
    expect(result.current.liveStatus).toBe("COMPLETED");
    expect(result.current.isActive).toBe(false);
  });

  it("stays active while the run is running, with the tool step current", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(realtime([status(run.id, 1, "RUNNING"), tool(run.id, 2, "tool_started", "generate_image")]));
    const { result } = renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isActive).toBe(true));
    expect(result.current.currentStep).toMatchObject({ kind: "tool", tools: [{ toolName: "generate_image", phase: "calling" }] });
  });
});

describe("useRunActivity — pending message visibility", () => {
  it("refetches messages on a step event, so a just-created pending message (plan, stream target) appears", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId, status: "WAITING" });
    const queryClient = createTestQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    serveActive(chatId, () => run);
    mockUseRealtimeRun.mockReturnValue(
      realtime([{ type: "step", runId: run.id, seq: 1, at: new Date().toISOString(), step: "thinking", round: 0 }]),
    );

    renderHook(() => useRunActivity(chatId), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["messages", chatId] }));
  });
});

describe("useCancelRun", () => {
  it("sends the cancellation for the correct run id and invalidates active-run + messages", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId, status: "CANCELLED" });
    let capturedRunId: string | null = null;
    server.use(
      http.post(`${API}/api/v1/chats/${chatId}/runs/:runId/cancel`, ({ params }) => {
        capturedRunId = params.runId as string;
        return okRun(run);
      }),
    );

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCancelRun(chatId), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync(run.id);
    });

    expect(capturedRunId).toBe(run.id);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["active-run", chatId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messages", chatId] });
  });
});
