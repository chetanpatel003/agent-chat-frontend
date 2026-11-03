// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({ useRealtimeRunWithStreams: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import type { AgentRunResponse, MessageResponse, WaitpointResponse } from "@/lib/api/contracts";
import type { RunActivity } from "@/hooks/use-run-activity";
import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
import { RunStatusIndicatorView } from "./run-status-indicator";
import { WaitpointCard } from "./waitpoint-card";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, only getToken/isSignedIn are used
  } as any);
});

const now = new Date().toISOString();

function message(overrides: Partial<MessageResponse>): MessageResponse {
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    agentRunId: randomUUID(),
    role: "ASSISTANT",
    status: "COMPLETE",
    content: [],
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    error: null,
    createdAt: now,
    ...overrides,
  };
}

function run(overrides: Partial<AgentRunResponse> = {}): AgentRunResponse {
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
    triggerRunId: "run_x",
    ...overrides,
  };
}

function activity(overrides: Partial<RunActivity> = {}): RunActivity {
  const activeRun = overrides.activeRun ?? run();
  return {
    activeRun,
    isActive: !!activeRun,
    liveStatus: activeRun?.status ?? null,
    toolActivity: null,
    currentStep: null,
    liveText: null,
    ...overrides,
  };
}

describe("MessageList — streaming bubble and turn outcomes", () => {
  it("renders streamed text token-by-token for the pending message, per round", () => {
    const pending = message({ status: "PENDING" });
    render(
      <MessageList
        messages={[pending]}
        live={{ text: { messageId: pending.id, rounds: ["1. Plan", "Done so f"] }}}
      />,
    );
    // Rendered as Markdown: "1. Plan" is an ordered-list item.
    expect(screen.getByRole("listitem")).toHaveTextContent("Plan");
    expect(screen.getByText("Done so f")).toBeInTheDocument();
    expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
  });

  it("ignores streamed text for a different message and falls back to persisted partial text", () => {
    const pending = message({ status: "PENDING", content: [{ type: "text", text: "flushed partial" }] });
    render(
      <MessageList messages={[pending]} live={{ text: { messageId: randomUUID(), rounds: ["other"] }}} />,
    );
    expect(screen.getByText("flushed partial")).toBeInTheDocument();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });

  it("an empty in-progress bubble shows a silent placeholder, never status text of its own", () => {
    // The run's status line is the one active indicator (no duplicate "Thinking…" here).
    const pending = message({ status: "PENDING" });
    const { container } = render(<MessageList messages={[pending]} live={{ text: null }} />);
    expect(container.querySelector("[data-pending-placeholder]")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/Thinking|Working|Generating|Waiting/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows thinking duration (timing only) on a finished message", () => {
    render(<MessageList messages={[message({ thinkingMs: 2400, content: [{ type: "text", text: "Answer" }] })]} />);
    expect(screen.getByText("Thought for 2s")).toBeInTheDocument();
    expect(screen.getByText("Answer")).toBeInTheDocument();
  });

  it("a failed turn keeps its partial output and explains the failure", () => {
    render(
      <MessageList
        messages={[
          message({
            status: "FAILED",
            content: [{ type: "text", text: "Half an answer" }],
            error: { code: "STREAM_INTERRUPTED", message: "The OpenRouter stream was interrupted before it finished" },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Half an answer")).toBeInTheDocument();
    expect(screen.getByText(/stream was interrupted/)).toBeInTheDocument();
  });

  it("stopped, interrupted and expired turns keep content and say what happened", () => {
    render(
      <MessageList
        messages={[
          message({ status: "CANCELLED", content: [{ type: "text", text: "partial A" }], error: { code: "CANCELLED_BY_USER", message: "" } }),
          message({ status: "CANCELLED", content: [{ type: "text", text: "partial B" }], error: { code: "INTERRUPTED_BY_USER", message: "" } }),
          message({
            status: "CANCELLED",
            content: [{ type: "text", text: "1. Plan" }],
            error: { code: "WAITPOINT_EXPIRED", message: "This plan wasn't approved within 24 hours. Send a new message to continue." },
          }),
        ]}
      />,
    );
    expect(screen.getByText("partial A")).toBeInTheDocument();
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByText("Interrupted.")).toBeInTheDocument();
    expect(screen.getByText(/Send a new message to continue/)).toBeInTheDocument();
  });
});

describe("MessageList — interrupted runs (RUN_INTERRUPTED)", () => {
  const interrupted = { code: "RUN_INTERRUPTED", message: "The execution stopped unexpectedly. Send a new message to continue." };

  it("keeps the partial content but labels it interrupted, never as a finished answer or in progress", () => {
    const pending = message({ status: "PENDING", content: [{ type: "text", text: "1. The plan" }], thinkingMs: 4000, error: interrupted });
    render(
      <MessageList
        messages={[pending]}
        // Stale realtime data for this message must not revive it as streaming.
        live={{ text: { messageId: pending.id, rounds: ["stale stream"] }}}
      />,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("The plan");
    expect(screen.getByText("Response interrupted")).toBeInTheDocument();
    expect(screen.getByText("The execution stopped unexpectedly. Send a new message to continue.")).toBeInTheDocument();
    expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
    expect(screen.queryByText("stale stream")).not.toBeInTheDocument();
  });

  it("an empty interrupted turn is an error state, not an endless Thinking indicator", () => {
    render(<MessageList messages={[message({ status: "PENDING", content: [], error: interrupted })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Response interrupted");
    expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
  });

  it("a PENDING message whose run ended for another reason shows that reason, not Thinking", () => {
    render(
      <MessageList
        messages={[message({ status: "PENDING", content: [], error: { code: "AMBIGUOUS_PROVIDER_OUTCOME", message: "The response was lost. Send a new message to try again." } })]}
      />,
    );
    expect(screen.getByText(/The response was lost/)).toBeInTheDocument();
    expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
  });

  it("a genuinely in-progress PENDING message (no error) shows the in-progress placeholder, not an error", () => {
    const { container } = render(<MessageList messages={[message({ status: "PENDING", content: [], error: null })]} />);
    expect(container.querySelector("[data-pending-placeholder]")).toBeInTheDocument();
    expect(screen.queryByText(/Stopped|Failed|interrupted/i)).not.toBeInTheDocument();
  });
});

describe("RunStatusIndicatorView — status model", () => {
  it("labels thinking with a timer, tools as working, approval as waiting", () => {
    const { rerender } = render(
      <RunStatusIndicatorView chatId="c" activity={activity({ currentStep: { kind: "thinking", since: new Date().toISOString() } })} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Thinking…\s*\d+s/);
    rerender(<RunStatusIndicatorView chatId="c" activity={activity({ currentStep: { kind: "responding", since: now } })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Writing…");
    rerender(<RunStatusIndicatorView chatId="c" activity={activity({ liveStatus: "WAITING" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your approval");
  });

  it("names the tool stage and counts the whole tool call's elapsed time", () => {
    const inv = randomUUID();
    const since = new Date(Date.now() - 83_000).toISOString();
    const { rerender } = render(
      <RunStatusIndicatorView
        chatId="c"
        activity={activity({ currentStep: { kind: "tool", toolName: "generate_image", toolInvocationId: inv, phase: "running", since } })}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Generating image…\s*1m 2[3-4]s$/);
    rerender(
      <RunStatusIndicatorView
        chatId="c"
        activity={activity({ currentStep: { kind: "tool", toolName: "generate_image", toolInvocationId: inv, phase: "provider_waiting", since } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Waiting for image…\s*1m 2[3-4]s$/);
    rerender(
      <RunStatusIndicatorView
        chatId="c"
        activity={activity({ currentStep: { kind: "tool", toolName: "merge_videos", toolInvocationId: inv, phase: "provider_waiting", since } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Waiting for merged video…/);
    rerender(
      <RunStatusIndicatorView
        chatId="c"
        activity={activity({ currentStep: { kind: "tool", toolName: "some_tool", toolInvocationId: inv, phase: "running", since } })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Running some_tool…/);
  });

  it("keeps the ticking timer out of the live region (only stage changes are announced)", () => {
    render(
      <RunStatusIndicatorView chatId="c" activity={activity({ currentStep: { kind: "thinking", since: new Date().toISOString() } })} />,
      { wrapper: createWrapper() },
    );
    const timer = screen.getByRole("status").querySelector(".tabular-nums");
    expect(timer).toHaveAttribute("aria-hidden", "true");
  });

  it("renders nothing once the run is no longer active (completed, failed or interrupted)", () => {
    const { container } = render(
      <RunStatusIndicatorView chatId="c" activity={activity({ isActive: false, liveStatus: "COMPLETED" })} />,
      { wrapper: createWrapper() },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Stopping… and disables Stop once clicked", async () => {
    const r = run();
    let cancels = 0;
    server.use(
      http.post(`${API}/api/v1/chats/c/runs/${r.id}/cancel`, async () => {
        cancels++;
        await new Promise((res) => setTimeout(res, 50));
        return HttpResponse.json({ ok: true, data: { ...r, status: "CANCELLED" } });
      }),
    );
    render(<RunStatusIndicatorView chatId="c" activity={activity({ activeRun: r })} />, { wrapper: createWrapper() });
    await userEvent.setup().click(screen.getByRole("button", { name: /stop/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Stopping…");
    expect(screen.getByRole("button", { name: /stop/i })).toBeDisabled();
    await waitFor(() => expect(cancels).toBe(1));
  });
});

describe("WaitpointCard — plan approval", () => {
  function waitpoint(r: AgentRunResponse, overrides: Partial<WaitpointResponse> = {}): WaitpointResponse {
    return {
      id: randomUUID(),
      agentRunId: r.id,
      type: "PLAN",
      status: "PENDING",
      payload: { plan: "1. Plan" },
      resolution: null,
      expiresAt: new Date(Date.now() + 23 * 3600_000).toISOString(),
      resolvedAt: null,
      createdAt: now,
      ...overrides,
    };
  }

  it("restores an open approval from REST and sends the decision (with an optional note)", async () => {
    const r = run({ status: "WAITING", waitingReason: "PLAN" });
    const wp = waitpoint(r);
    let body: unknown = null;
    server.use(
      http.get(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints`, () => HttpResponse.json({ ok: true, data: { items: [wp] } })),
      http.post(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints/${wp.id}/resolve`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, data: { ...wp, status: "RESOLVED", resolution: body } });
      }),
      http.get(`${API}/api/v1/chats/c/runs/active`, () => HttpResponse.json({ ok: true, data: r })),
    );
    render(<WaitpointCard chatId="c" activity={activity({ activeRun: r })} />, { wrapper: createWrapper() });

    expect(await screen.findByRole("region", { name: "Plan approval" })).toHaveTextContent(/Expires in about 2\dh/);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Optional note for the agent"), "keep it short");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(body).toEqual({ decision: "approve", note: "keep it short" }));
  });

  it("shows the server's reason when a decision can't be applied (e.g. expired)", async () => {
    const r = run({ status: "WAITING", waitingReason: "PLAN" });
    const wp = waitpoint(r);
    server.use(
      http.get(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints`, () => HttpResponse.json({ ok: true, data: { items: [wp] } })),
      http.post(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints/${wp.id}/resolve`, () =>
        HttpResponse.json(
          { ok: false, error: { code: "ConflictError", message: "This plan wasn't approved within 24 hours. Send a new message to continue." } },
          { status: 409 },
        ),
      ),
      http.get(`${API}/api/v1/chats/c/runs/active`, () => HttpResponse.json({ ok: true, data: null })),
    );
    render(<WaitpointCard chatId="c" activity={activity({ activeRun: r })} />, { wrapper: createWrapper() });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Send a new message to continue/);
  });

  it.each([
    [409, "RunInterruptedError", "This run stopped unexpectedly, so the decision can't be applied. Send a new message to continue."],
    [503, "ExecutionStatusUnavailableError", "We couldn't confirm the run is still waiting for you. Nothing was changed — try again in a moment."],
  ])("shows the server's reason when the decision is refused (%s %s)", async (status, code, text) => {
    const r = run({ status: "WAITING", waitingReason: "PLAN" });
    const wp = waitpoint(r);
    server.use(
      http.get(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints`, () => HttpResponse.json({ ok: true, data: { items: [wp] } })),
      http.post(`${API}/api/v1/chats/c/runs/${r.id}/waitpoints/${wp.id}/resolve`, () =>
        HttpResponse.json({ ok: false, error: { code, message: text } }, { status }),
      ),
      http.get(`${API}/api/v1/chats/c/runs/active`, () => HttpResponse.json({ ok: true, data: status === 503 ? r : null })),
    );
    render(<WaitpointCard chatId="c" activity={activity({ activeRun: r })} />, { wrapper: createWrapper() });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    // Retryable: the decision can be sent again.
    if (status === 503) expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("renders nothing unless the run is waiting with a pending waitpoint", async () => {
    const r = run({ status: "RUNNING" });
    const { container } = render(<WaitpointCard chatId="c" activity={activity({ activeRun: r })} />, { wrapper: createWrapper() });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MessageComposer — plan mode", () => {
  it("sends planMode when the plan toggle is on", async () => {
    const chatId = randomUUID();
    let body: unknown = null;
    server.use(
      http.post(`${API}/api/v1/chats/${chatId}/messages`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, data: { chatId, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "run_x" } }, { status: 202 });
      }),
    );
    render(<MessageComposer chatId={chatId} />, { wrapper: createWrapper() });
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: "Plan mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Message"), "make a poster");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(body).toEqual({ text: "make a poster", attachmentIds: [], planMode: true }));
  });
});
