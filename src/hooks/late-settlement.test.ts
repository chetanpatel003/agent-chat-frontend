import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { awaitsLateSettlement, LATE_SETTLEMENT_WINDOW_MS } from "./use-messages";
import type { MessageResponse, PaginatedMessageResponse } from "@/lib/api/contracts";

const NOW = Date.parse("2026-11-03T09:00:00Z");

function message(opts: { tool?: string; status?: "COMPLETED" | "FAILED"; charged?: number | null; ageMs?: number; error?: boolean }): MessageResponse {
  const id = randomUUID();
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    agentRunId: null,
    role: "ASSISTANT",
    status: "COMPLETE",
    content: [
      { type: "tool_use", toolInvocationId: id, toolName: opts.tool ?? "generate_image", status: opts.status ?? "COMPLETED", input: {} },
      {
        type: "tool_result",
        toolInvocationId: id,
        output: null,
        durationMs: 1,
        creditsCharged: opts.charged === undefined ? null : opts.charged,
        error: opts.error ? { code: "X", message: "x" } : null,
      },
    ],
    attachments: [],
    thinkingMs: null,
    error: null,
    createdAt: new Date(NOW - (opts.ageMs ?? 60_000)).toISOString(),
  };
}
const pages = (...items: MessageResponse[]): PaginatedMessageResponse[] => [{ items, olderCursor: null, hasMore: false }];

describe("awaitsLateSettlement (refresh until usage settles)", () => {
  it("polls for a recent successful media result without settled usage", () => {
    expect(awaitsLateSettlement(pages(message({})), NOW)).toBe(true);
  });
  it("stops once usage is settled, for failed or non-media calls, and after the window", () => {
    expect(awaitsLateSettlement(pages(message({ charged: 273_936 })), NOW)).toBe(false);
    expect(awaitsLateSettlement(pages(message({ status: "FAILED", error: true })), NOW)).toBe(false);
    expect(awaitsLateSettlement(pages(message({ tool: "load_skill" })), NOW)).toBe(false);
    expect(awaitsLateSettlement(pages(message({ ageMs: LATE_SETTLEMENT_WINDOW_MS + 1 })), NOW)).toBe(false);
    expect(awaitsLateSettlement(undefined, NOW)).toBe(false);
  });
});
