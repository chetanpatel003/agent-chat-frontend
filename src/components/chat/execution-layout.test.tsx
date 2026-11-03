// @vitest-environment jsdom
// Regression: where the active run's status sits relative to the answer, and
// what the finished turn's durations mean (production merge_videos report:
// status shown after the answer; "Thought for 4s" on a multi-minute merge).
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { render, screen, within } from "@testing-library/react";
import type { MessageResponse } from "@/lib/api/contracts";
import { MessageList, type RunStatusSlot } from "./message-list";
import { formatDurationMs } from "@/lib/durations";

const chatId = randomUUID();
const runId = randomUUID();
const mergeId = randomUUID();
const VIDEO = "https://cdn.example.com/merged.mp4";

function message(overrides: Partial<MessageResponse>): MessageResponse {
  return {
    id: randomUUID(),
    chatId,
    agentRunId: null,
    role: "ASSISTANT",
    status: "COMPLETE",
    content: [],
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    runQueueMs: null,
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const userMsg = message({ role: "USER", content: [{ type: "text", text: "Merge my two clips" }] });
const status = (label: string): RunStatusSlot => ({ runId, node: <span role="status">{label}</span> });

const mergeUse = (status: "RUNNING" | "COMPLETED") =>
  ({ type: "tool_use", toolInvocationId: mergeId, toolName: "merge_videos", displayName: "Merge Videos", status, input: {} }) as const;
const mergeResult = (durationMs: number | null) =>
  ({ type: "tool_result", toolInvocationId: mergeId, output: { images: [VIDEO] }, durationMs, creditsCharged: 120, error: null }) as const;

/** DOM order: true when `a` comes before `b`. */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("status placement", () => {
  it("queued (no assistant message yet): a status row after the user's message, nothing else", () => {
    const { container } = render(<MessageList messages={[userMsg]} runStatus={status("Queued…")} />);
    const row = container.querySelector("[data-run-status-row]");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("status")).toHaveTextContent("Queued…");
    expect(before(screen.getByText("Merge my two clips"), row as Element)).toBe(true);
  });

  it("tool running: the status is at the top of that run's in-progress message, before its content", () => {
    const pending = message({
      agentRunId: runId,
      status: "PENDING",
      content: [{ type: "text", text: "Merging your clips now." }, mergeUse("RUNNING")],
    });
    const { container } = render(<MessageList messages={[userMsg, pending]} runStatus={status("Merging videos…")} />);
    const bubble = container.querySelector(`[data-role="ASSISTANT"]`) as HTMLElement;
    const indicator = within(bubble).getByRole("status");
    expect(indicator).toHaveTextContent("Merging videos…");
    expect(before(indicator, within(bubble).getByText("Merging your clips now."))).toBe(true);
    expect(container.querySelector("[data-run-status-row]")).toBeNull(); // shown once, not twice
  });

  it("a status for another run is never placed on this run's message", () => {
    const other = message({ agentRunId: randomUUID(), status: "PENDING", content: [{ type: "text", text: "older" }] });
    const { container } = render(<MessageList messages={[other]} runStatus={status("Thinking…")} />);
    expect(within(container.querySelector(`[data-role="ASSISTANT"]`) as HTMLElement).queryByRole("status")).toBeNull();
    expect(container.querySelector("[data-run-status-row]")).not.toBeNull();
  });

  it("once the run's answer is complete, no live status is shown under or after it (run still wrapping up)", () => {
    const done = message({ agentRunId: runId, content: [{ type: "text", text: "Here is your video." }, mergeUse("COMPLETED"), mergeResult(185_000)] });
    render(<MessageList messages={[userMsg, done]} runStatus={status("Working…")} />);
    expect(screen.queryByText("Working…")).not.toBeInTheDocument();
    expect(screen.getByText("Here is your video.")).toBeInTheDocument();
  });
});

describe("completed response layout", () => {
  const completed = message({
    agentRunId: runId,
    thinkingMs: 4_200,
    runDurationMs: 192_500,
    content: [{ type: "text", text: "Here is your merged video." }, mergeUse("COMPLETED"), mergeResult(185_000)],
  });

  it("execution details come first, then the answer and its media with credits", () => {
    const { container } = render(<MessageList messages={[completed]} />);
    const summary = container.querySelector("[data-run-summary]") as HTMLElement;
    expect(summary).not.toBeNull();
    expect(within(summary).getByText("Thought for 4s")).toBeInTheDocument();
    expect(within(summary).getByText("Took 3m 13s")).toBeInTheDocument();
    expect(within(summary).getByRole("listitem")).toHaveTextContent("Merge Videos · 3m 05s");
    const answer = screen.getByText("Here is your merged video.");
    expect(before(summary, answer)).toBe(true);
    expect(container.querySelector("video")).not.toBeNull();
    expect(before(answer, container.querySelector("video") as Element)).toBe(true);
    expect(screen.getByText(/credits charged/)).toBeInTheDocument();
  });

  it("renders identically from the persisted copy after a refresh (no realtime state involved)", () => {
    const first = render(<MessageList messages={[completed]} />).container.innerHTML;
    // A reload: the same message, re-fetched (structurally equal, new object).
    const reloaded = JSON.parse(JSON.stringify(completed)) as MessageResponse;
    const second = render(<MessageList messages={[reloaded]} live={{ text: null }} />).container.innerHTML;
    expect(second).toBe(first);
  });

  it("a failed tool call stays in the history, marked failed", () => {
    const failed = message({
      agentRunId: runId,
      status: "FAILED",
      content: [
        { ...mergeUse("COMPLETED"), status: "FAILED" },
        { type: "tool_result", toolInvocationId: mergeId, output: null, durationMs: 12_000, creditsCharged: null, error: { code: "EXECUTION_FAILED", message: "x" } },
      ],
      error: { code: "TOOL_FAILED", message: "The merge failed." },
    });
    render(<MessageList messages={[failed]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Merge Videos — failed · 12s");
  });
});

describe("durations: long-running tools and missing/invalid timestamps", () => {
  it("a multi-minute merge is reported from its measured duration, never the model's thinking time", () => {
    render(
      <MessageList
        messages={[message({ thinkingMs: 4_000, runDurationMs: 30 * 60_000 + 5_000, content: [mergeUse("COMPLETED"), mergeResult(29 * 60_000)] })]}
      />,
    );
    expect(screen.getByText("Thought for 4s")).toBeInTheDocument();
    expect(screen.getByText("Took 30m 05s")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Merge Videos · 29m 00s");
  });

  it("missing durations are omitted, never estimated or shown as zero", () => {
    render(<MessageList messages={[message({ thinkingMs: null, runDurationMs: null, content: [mergeUse("COMPLETED"), mergeResult(null)] })]} />);
    expect(screen.queryByText(/Thought for|Took/)).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(/^Merge Videos$/);
  });

  it("a turn with no timing and no tools shows no execution details at all", () => {
    const { container } = render(<MessageList messages={[message({ content: [{ type: "text", text: "Hi" }] })]} />);
    expect(container.querySelector("[data-run-summary]")).toBeNull();
  });

  it.each([
    [null, null],
    [undefined, null],
    [Number.NaN, null],
    [-5, null],
    [Number.POSITIVE_INFINITY, null],
    [0, "1s"],
    [400, "1s"],
    [4_200, "4s"],
    [59_499, "59s"],
    [60_000, "1m 00s"],
    [192_500, "3m 13s"],
  ])("formatDurationMs(%s) → %s", (ms, expected) => {
    expect(formatDurationMs(ms as number | null | undefined)).toBe(expected);
  });
});
