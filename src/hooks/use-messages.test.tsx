// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { useMessages } from "./use-messages";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const mockUseAuth = vi.mocked(useAuth);
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

const CHAT_ID = randomUUID();

function makeMessage(text: string) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    chatId: CHAT_ID,
    agentRunId: null,
    role: "USER" as const,
    status: "COMPLETE" as const,
    content: [{ type: "text" as const, text }],
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    runQueueMs: null,
    error: null,
    createdAt: now,
  };
}

describe("useMessages", () => {
  it("does nothing without a chatId", async () => {
    let called = false;
    server.use(
      http.get(`${API}/api/v1/chats/:chatId/messages`, () => {
        called = true;
        return HttpResponse.json({ ok: true, data: { items: [], olderCursor: null, hasMore: false } });
      }),
    );
    const { result } = renderHook(() => useMessages(undefined), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("loads the first page for a given chat", async () => {
    const msg = makeMessage("hello");
    server.use(
      http.get(`${API}/api/v1/chats/${CHAT_ID}/messages`, () =>
        HttpResponse.json({ ok: true, data: { items: [msg], olderCursor: null, hasMore: false } }),
      ),
    );
    const { result } = renderHook(() => useMessages(CHAT_ID), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items).toEqual([msg]);
  });

  it("loads an older page using the response's olderCursor as the next request's cursor — not nextCursor", async () => {
    const recent = makeMessage("recent");
    const older = makeMessage("older");
    let requestedCursor: string | null | undefined;
    server.use(
      http.get(`${API}/api/v1/chats/${CHAT_ID}/messages`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            ok: true,
            data: { items: [recent], olderCursor: "older-cursor", hasMore: true },
          });
        }
        requestedCursor = cursor;
        return HttpResponse.json({
          ok: true,
          data: { items: [older], olderCursor: null, hasMore: false },
        });
      }),
    );

    const { result, rerender } = renderHook(() => useMessages(CHAT_ID), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    rerender();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(requestedCursor).toBe("older-cursor");
    expect(result.current.data?.pages[1].items).toEqual([older]);
  });
});
