// @vitest-environment jsdom
// Regression: tool statuses were hard-coded per tool ("Waiting for image…")
// with no Starting/Receiving/Saving phases and no parallel view. The status
// is now one generic lifecycle driven by real events and backend labels.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { render, screen, within } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({ useRealtimeRunWithStreams: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import type { AgentRunResponse, MessageResponse } from "@/lib/api/contracts";
import type { ActiveTool, RunActivity } from "@/hooks/use-run-activity";
import { RunStatusIndicatorView, statusOf, toolPhaseLabel } from "./run-status-indicator";
import { MessageList } from "./message-list";

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("t"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
  } as any);
});

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function run(overrides: Partial<AgentRunResponse> = {}): AgentRunResponse {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), chatId: randomUUID(), status: "RUNNING", waitingReason: null, model: null, promptTokens: null,
    completionTokens: null, turnCount: 1, planMode: false, errorCode: null, errorMessage: null, startedAt: now,
    completedAt: null, createdAt: now, updatedAt: now, triggerRunId: "run_x", ...overrides,
  };
}

function activity(overrides: Partial<RunActivity> = {}): RunActivity {
  const activeRun = overrides.activeRun ?? run();
  return { activeRun, isActive: true, liveStatus: activeRun.status, toolActivity: null, currentStep: null, liveText: null, ...overrides };
}

const tool = (toolName: string, name: string, act: string, phase: ActiveTool["phase"], since = iso(5_000)): ActiveTool => ({
  toolInvocationId: randomUUID(), toolName, display: { name, activity: act }, phase, since,
});

describe("generic lifecycle labels", () => {
  it.each([
    ["merge_videos", "Merge Videos", "Merging videos with Magica"],
    ["crop_image", "Crop Image", "Cropping image with Magica"],
    ["generate_image", "GPT Image 2", "Generating image with Magica"],
    ["load_skill", "Skill loader", "Loading skill"],
  ])("%s: same phases, its own wording", (toolName, name, act) => {
    expect(toolPhaseLabel(tool(toolName, name, act, "calling"))).toBe(`Calling ${name}…`);
    expect(toolPhaseLabel(tool(toolName, name, act, "provider_waiting"))).toBe(`${act}…`);
    expect(toolPhaseLabel(tool(toolName, name, act, "receiving"))).toBe(`Receiving result from ${name}…`);
    expect(toolPhaseLabel(tool(toolName, name, act, "saving"))).toBe(`Saving result from ${name}…`);
  });

  it("run-level phases: queued (timed from admission), starting, thinking, writing, approval, stopping", () => {
    const created = iso(42_000);
    expect(statusOf(activity({ activeRun: run({ status: "QUEUED", createdAt: created }), liveStatus: "QUEUED" }), false)).toEqual({ label: "Queued…", since: created });
    expect(statusOf(activity({ currentStep: { kind: "starting", since: iso(0) } }), false)).toEqual({ label: "Starting…" });
    expect(statusOf(activity(), false)).toEqual({ label: "Starting…" }); // RUNNING, no step yet: never "Thinking…"
    expect(statusOf(activity({ currentStep: { kind: "thinking", since: created } }), false)).toEqual({ label: "Thinking…", since: created });
    expect(statusOf(activity({ currentStep: { kind: "responding", since: created } }), false).label).toBe("Writing…");
    expect(statusOf(activity({ liveStatus: "WAITING" }), false).label).toBe("Waiting for your approval");
    expect(statusOf(activity({ currentStep: { kind: "thinking", since: created } }), true).label).toBe("Stopping…");
  });
});

describe("RunStatusIndicatorView", () => {
  it("queue time counts from the run's admission, not from when the worker started", () => {
    const queued = run({ status: "QUEUED", createdAt: iso(65_000), startedAt: null });
    render(<RunStatusIndicatorView chatId="c" activity={activity({ activeRun: queued, liveStatus: "QUEUED" })} />, { wrapper: createWrapper() });
    expect(screen.getByRole("status")).toHaveTextContent(/^Queued…\s*1m 0[5-6]s$/);
  });

  it("a single tool shows its current phase and the whole call's elapsed time", () => {
    const merge = tool("merge_videos", "Merge Videos", "Merging videos with Magica", "provider_waiting", iso(185_000));
    render(<RunStatusIndicatorView chatId="c" activity={activity({ currentStep: { kind: "tool", tools: [merge], since: merge.since } })} />, { wrapper: createWrapper() });
    expect(screen.getByRole("status")).toHaveTextContent(/^Merging videos with Magica…\s*3m 0[5-6]s$/);
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled(); // cancellation preserved
  });

  it("parallel tools: lists each running call with its own status and elapsed time", () => {
    const a = tool("load_skill", "Skill loader", "Loading skill", "calling", iso(3_000));
    const b = tool("read_skill_asset", "Skill guide", "Reading skill guide", "receiving", iso(2_000));
    const c = tool("load_skill", "Skill loader", "Loading skill", "saving", iso(1_000));
    render(<RunStatusIndicatorView chatId="c" activity={activity({ currentStep: { kind: "tool", tools: [a, b, c], since: a.since } })} />, { wrapper: createWrapper() });
    expect(screen.getByRole("status")).toHaveTextContent("Running 3 tools…");
    const items = within(screen.getByRole("list", { name: "Running tools" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.replace(/\s*\d+s$/, ""))).toEqual([
      "Calling Skill loader…",
      "Receiving result from Skill guide…",
      "Saving result from Skill loader…",
    ]);
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("shows nothing once the run has ended (failed, cancelled, interrupted): no stale status", () => {
    const merge = tool("merge_videos", "Merge Videos", "Merging videos with Magica", "provider_waiting");
    const { container } = render(
      <RunStatusIndicatorView chatId="c" activity={activity({ isActive: false, liveStatus: "FAILED", currentStep: { kind: "tool", tools: [merge], since: merge.since } })} />,
      { wrapper: createWrapper() },
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("history after refresh", () => {
  function message(overrides: Partial<MessageResponse>): MessageResponse {
    return {
      id: randomUUID(), chatId: randomUUID(), agentRunId: randomUUID(), role: "ASSISTANT", status: "COMPLETE", content: [],
      attachments: [], thinkingMs: null, runDurationMs: null, runQueueMs: null, error: null, createdAt: new Date().toISOString(), ...overrides,
    };
  }

  it("shows measured queue time, thinking time and total separately, and tools by their display names", () => {
    const id = randomUUID();
    render(
      <MessageList
        messages={[
          message({
            runQueueMs: 3_200, thinkingMs: 4_000, runDurationMs: 192_000,
            content: [
              { type: "tool_use", toolInvocationId: id, toolName: "crop_image", displayName: "Crop Image", status: "COMPLETED", input: {} },
              { type: "tool_result", toolInvocationId: id, output: null, durationMs: 9_000, creditsCharged: null, error: null },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Queued 3s")).toBeInTheDocument();
    expect(screen.getByText("Thought for 4s")).toBeInTheDocument();
    expect(screen.getByText("Took 3m 12s")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Crop Image · 9s");
  });

  it("a negligible queue time is not shown; an older server's tool block falls back to a neutral name", () => {
    const id = randomUUID();
    render(<MessageList messages={[message({ runQueueMs: 300, content: [{ type: "tool_use", toolInvocationId: id, toolName: "search_web", status: "COMPLETED", input: {} }] })]} />);
    expect(screen.queryByText(/Queued/)).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(/^Search web$/);
  });

  it("a plain chat turn (no tools) is unchanged: no steps list", () => {
    const { container } = render(<MessageList messages={[message({ thinkingMs: 2_400, content: [{ type: "text", text: "Hello" }] })]} />);
    expect(screen.getByText("Thought for 2s")).toBeInTheDocument();
    expect(container.querySelector('[aria-label="Steps"]')).toBeNull();
  });
});
