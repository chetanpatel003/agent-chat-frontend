import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { toCurrentStep, toLiveText } from "./use-run-activity";
import type { RunEvent } from "@/lib/api/contracts";

const runId = randomUUID();
const at = (s: number) => new Date(Date.UTC(2026, 10, 2, 12, 0, s)).toISOString();

describe("toLiveText", () => {
  it("accumulates deltas per round for the latest message, ignoring invalid parts", () => {
    const messageId = randomUUID();
    const live = toLiveText([
      { messageId, round: 0, delta: "1. Plan" },
      { nope: true },
      { messageId, round: 1, delta: "Do" },
      { messageId, round: 1, delta: "ne." },
    ]);
    expect(live).toEqual({ messageId, rounds: ["1. Plan", "Done."] });
  });

  it("fills a missing round with empty text and returns null with no parts", () => {
    const messageId = randomUUID();
    expect(toLiveText([{ messageId, round: 1, delta: "x" }])).toEqual({ messageId, rounds: ["", "x"] });
    expect(toLiveText(undefined)).toBeNull();
    expect(toLiveText([])).toBeNull();
  });

  it("keeps only the most recent message's text", () => {
    const [a, b] = [randomUUID(), randomUUID()];
    expect(toLiveText([{ messageId: a, round: 0, delta: "old" }, { messageId: b, round: 0, delta: "new" }])).toEqual({
      messageId: b,
      rounds: ["new"],
    });
  });
});

describe("toCurrentStep", () => {
  const base = { runId };
  it("is decided by the highest seq among step and tool events, regardless of array order", () => {
    const crop = randomUUID();
    const events: RunEvent[] = [
      { ...base, type: "tool_started", seq: 4, at: at(4), toolInvocationId: crop, toolName: "crop_image" },
      { ...base, type: "step", seq: 2, at: at(2), step: "thinking", round: 0 },
      { ...base, type: "thinking_completed", seq: 3, at: at(3), round: 0, durationMs: 900 },
      { ...base, type: "run_status", seq: 5, at: at(5), status: "RUNNING" },
    ];
    expect(toCurrentStep(events)).toEqual({ kind: "tool", toolName: "crop_image", toolInvocationId: crop, phase: "running", since: at(4) });
  });

  it("thinking → tool running → provider waiting (elapsed still counted from the tool's start) → back to thinking", () => {
    const inv = randomUUID();
    const thinking: RunEvent = { ...base, type: "step", seq: 1, at: at(1), step: "thinking", round: 0 };
    const started: RunEvent = { ...base, type: "tool_started", seq: 2, at: at(2), toolInvocationId: inv, toolName: "generate_image" };
    const waiting: RunEvent = { ...base, type: "tool_progress", seq: 3, at: at(3), toolInvocationId: inv, toolName: "generate_image", phase: "provider_waiting" };
    const done: RunEvent = { ...base, type: "tool_completed", seq: 4, at: at(4), toolInvocationId: inv, toolName: "generate_image" };
    const next: RunEvent = { ...base, type: "step", seq: 5, at: at(5), step: "thinking", round: 1 };

    expect(toCurrentStep([thinking])).toEqual({ kind: "thinking", since: at(1) });
    expect(toCurrentStep([thinking, started])).toMatchObject({ kind: "tool", phase: "running", since: at(2) });
    expect(toCurrentStep([thinking, started, waiting])).toMatchObject({ kind: "tool", phase: "provider_waiting", since: at(2) });
    expect(toCurrentStep([thinking, started, waiting, done])).toEqual({ kind: "working", since: at(4) });
    expect(toCurrentStep([thinking, started, waiting, done, next])).toEqual({ kind: "thinking", since: at(5) });
  });

  it("a late (lower-seq) event never restores an older step", () => {
    const inv = randomUUID();
    const started: RunEvent = { ...base, type: "tool_started", seq: 2, at: at(2), toolInvocationId: inv, toolName: "generate_image" };
    const waiting: RunEvent = { ...base, type: "tool_progress", seq: 3, at: at(3), toolInvocationId: inv, toolName: "generate_image", phase: "provider_waiting" };
    const done: RunEvent = { ...base, type: "tool_completed", seq: 4, at: at(4), toolInvocationId: inv, toolName: "generate_image" };
    const next: RunEvent = { ...base, type: "step", seq: 5, at: at(5), step: "responding", round: 1 };
    // Delivered out of order: the newest step wins whatever arrives last.
    expect(toCurrentStep([next, done, waiting, started])).toEqual({ kind: "responding", since: at(5) });
    expect(toCurrentStep([waiting, started])).toMatchObject({ phase: "provider_waiting" });
    expect(toCurrentStep([done, started])).toEqual({ kind: "working", since: at(4) });
  });

  it("maps step events and finished tools", () => {
    expect(toCurrentStep([{ ...base, type: "step", seq: 1, at: at(1), step: "waiting", round: 0 }])).toEqual({
      kind: "waiting",
      since: at(1),
    });
    expect(
      toCurrentStep([{ ...base, type: "tool_completed", seq: 1, at: at(1), toolInvocationId: randomUUID(), toolName: "x" }]),
    ).toEqual({ kind: "working", since: at(1) });
    expect(toCurrentStep([])).toBeNull();
  });
});
