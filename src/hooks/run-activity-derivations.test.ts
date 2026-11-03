import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { parseRunEvents, toCurrentStep, toLiveText } from "./use-run-activity";
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

describe("toCurrentStep — generic tool lifecycle from real events", () => {
  const base = { runId };
  const merge = { name: "Merge Videos", activity: "Merging videos with Magica" };
  const started = (seq: number, id: string, toolName = "merge_videos", display: typeof merge | undefined = merge): RunEvent => ({
    ...base, type: "tool_started", seq, at: at(seq), toolInvocationId: id, toolName, ...(display ? { display } : {}),
  });
  const progress = (seq: number, id: string, phase: "provider_waiting" | "receiving" | "saving", toolName = "merge_videos"): RunEvent => ({
    ...base, type: "tool_progress", seq, at: at(seq), toolInvocationId: id, toolName, phase,
  });
  const completed = (seq: number, id: string, toolName = "merge_videos"): RunEvent => ({ ...base, type: "tool_completed", seq, at: at(seq), toolInvocationId: id, toolName });
  const failed = (seq: number, id: string, toolName = "merge_videos"): RunEvent => ({ ...base, type: "tool_failed", seq, at: at(seq), toolInvocationId: id, toolName, errorCode: "EXECUTION_FAILED" });
  const step = (seq: number, s: "thinking" | "responding" | "waiting"): RunEvent => ({ ...base, type: "step", seq, at: at(seq), step: s, round: 0 });
  const running = (seq: number): RunEvent => ({ ...base, type: "run_status", seq, at: at(seq), status: "RUNNING" });
  const phaseOf = (r: ReturnType<typeof toCurrentStep>) => (r?.kind === "tool" ? r.tools.map((t) => t.phase) : r?.kind);

  it("starting → thinking → calling → activity → receiving → saving → working → next round", () => {
    const id = randomUUID();
    const seq: RunEvent[] = [running(1), step(2, "thinking"), started(3, id), progress(4, id, "provider_waiting"), progress(5, id, "receiving"), progress(6, id, "saving"), completed(7, id), step(8, "responding")];
    const at_ = (n: number) => toCurrentStep(seq.slice(0, n));
    expect(at_(1)).toEqual({ kind: "starting", since: at(1) });
    expect(at_(2)).toEqual({ kind: "thinking", since: at(2) });
    expect(phaseOf(at_(3))).toEqual(["calling"]);
    expect(phaseOf(at_(4))).toEqual(["provider_waiting"]);
    expect(phaseOf(at_(5))).toEqual(["receiving"]);
    expect(phaseOf(at_(6))).toEqual(["saving"]);
    expect(at_(7)).toEqual({ kind: "working", since: at(7) });
    expect(at_(8)).toEqual({ kind: "responding", since: at(8) });
    // Elapsed time always counts from the tool call's own start, whatever the phase.
    const r = at_(6);
    expect(r?.kind === "tool" && r.tools[0].since).toBe(at(3));
    expect(r?.kind === "tool" && r.tools[0].display).toEqual(merge);
  });

  it("parallel calls: each in flight with its own phase, in start order; finished ones drop out", () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    const events: RunEvent[] = [step(1, "thinking"), started(2, a, "load_skill"), started(3, b, "read_skill_asset"), started(4, c, "load_skill"), progress(5, b, "receiving", "read_skill_asset"), completed(6, a, "load_skill")];
    const r = toCurrentStep(events);
    expect(r?.kind).toBe("tool");
    expect(r?.kind === "tool" && r.tools.map((t) => [t.toolInvocationId, t.phase])).toEqual([[b, "receiving"], [c, "calling"]]);
    expect(toCurrentStep([...events, failed(7, b, "read_skill_asset"), completed(8, c, "load_skill")])).toEqual({ kind: "working", since: at(8) });
  });

  it("out-of-order delivery: ordered by seq, a late lower-seq event never restores an older phase", () => {
    const id = randomUUID();
    expect(phaseOf(toCurrentStep([progress(5, id, "saving"), started(3, id), progress(4, id, "provider_waiting")]))).toEqual(["saving"]);
    expect(toCurrentStep([step(9, "responding"), completed(7, id), progress(5, id, "saving"), started(3, id)])).toEqual({ kind: "responding", since: at(9) });
  });

  it("failure: a failed call leaves the in-flight set immediately", () => {
    const id = randomUUID();
    expect(toCurrentStep([step(1, "thinking"), started(2, id), progress(3, id, "provider_waiting"), progress(4, id, "receiving"), failed(5, id)])).toEqual({ kind: "working", since: at(5) });
  });

  it("retry / worker restart: a call stranded by a crashed attempt is not shown once a new attempt starts", () => {
    const id = randomUUID();
    const stranded = [step(1, "thinking"), started(2, id), progress(3, id, "provider_waiting")];
    expect(phaseOf(toCurrentStep(stranded))).toEqual(["provider_waiting"]);
    expect(toCurrentStep([...stranded, running(4)])).toEqual({ kind: "starting", since: at(4) });
    expect(toCurrentStep([...stranded, running(4), step(5, "thinking")])).toEqual({ kind: "thinking", since: at(5) });
  });

  it("events without a display (older server) get a neutral label from the tool name", () => {
    const id = randomUUID();
    const noDisplay: RunEvent = { ...base, type: "tool_started", seq: 1, at: at(1), toolInvocationId: id, toolName: "search_web" };
    const r = toCurrentStep([noDisplay]);
    expect(r?.kind === "tool" && r.tools[0].display).toEqual({ name: "Search web", activity: "Running search web" });
  });

  it("non-tool turns and edge cases", () => {
    expect(toCurrentStep([step(1, "waiting")])).toEqual({ kind: "waiting", since: at(1) });
    expect(toCurrentStep([completed(1, randomUUID(), "x")])).toEqual({ kind: "working", since: at(1) });
    expect(toCurrentStep([])).toBeNull();
  });
});

describe("parseRunEvents", () => {
  it("drops only the invalid or unknown events, never the whole history", () => {
    const ok = { runId, type: "step", seq: 1, at: at(1), step: "thinking", round: 0 };
    const unknownPhase = { runId, type: "tool_progress", seq: 2, at: at(2), toolInvocationId: randomUUID(), toolName: "x", phase: "teleporting" };
    expect(parseRunEvents([ok, unknownPhase, { garbage: true }]).map((e) => e.seq)).toEqual([1]);
    expect(parseRunEvents("nope")).toEqual([]);
  });
});
