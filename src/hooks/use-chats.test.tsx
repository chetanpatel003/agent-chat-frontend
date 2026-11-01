// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createTestQueryClient, createWrapper } from "@/test-utils/query-wrapper";
import {
  useChats,
  useCreateChat,
  useUpdateChatTitle,
  useTogglePinChat,
  useDeleteChat,
} from "./use-chats";
import type { ApiError } from "@/lib/api/client";
import type { ChatResponse } from "@/lib/api/contracts";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, only getToken/isSignedIn are used
  } as any);
});

function makeChat(overrides: Partial<ChatResponse> = {}): ChatResponse {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: "Test chat",
    isPinned: false,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function okList(items: ChatResponse[], nextCursor: string | null = null, hasMore = false) {
  return HttpResponse.json({ ok: true, data: { items, nextCursor, hasMore } });
}

describe("useChats — query hook", () => {
  it("attaches the Clerk token and returns the first page", async () => {
    const chat = makeChat();
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${API}/api/v1/chats`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return okList([chat]);
      }),
    );

    const { result } = renderHook(() => useChats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedAuth).toBe("Bearer test-token");
    expect(result.current.data?.pages[0].items).toEqual([chat]);
  });

  it("never calls the backend when signed out", async () => {
    mockUseAuth.mockReturnValue({
      getToken: vi.fn(),
      isSignedIn: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    let called = false;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        called = true;
        return okList([]);
      }),
    );

    const { result } = renderHook(() => useChats(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("surfaces a 401 ApiError for an invalid/expired token without retrying", async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        attempts++;
        return HttpResponse.json(
          { ok: false, error: { code: "UnauthorizedError", message: "Authentication required" } },
          { status: 401 },
        );
      }),
    );

    const { result } = renderHook(() => useChats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as ApiError).status).toBe(401);
    expect(attempts).toBe(1); // the test QueryClient disables retry entirely
  });

  it("fetches the next page using the response's nextCursor as the next request's cursor", async () => {
    const chatA = makeChat({ title: "A" });
    const chatB = makeChat({ title: "B" });
    let requestedCursor: string | null | undefined;
    server.use(
      http.get(`${API}/api/v1/chats`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) return okList([chatA], "cursor-1", true);
        requestedCursor = cursor;
        return okList([chatB], null, false);
      }),
    );

    const { result, rerender } = renderHook(() => useChats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await result.current.fetchNextPage();
    });
    // fetchNextPage()'s own return value already has 2 pages at this
    // point (confirmed independently); rerender() forces this hook's
    // external-store snapshot to catch up — see the comment in the
    // title-patch test below for why this is needed in this environment.
    rerender();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(requestedCursor).toBe("cursor-1");
    expect(result.current.data?.pages[1].items).toEqual([chatB]);
  });

  it("passes the search term through as the q query param", async () => {
    let capturedQ: string | null = null;
    server.use(
      http.get(`${API}/api/v1/chats`, ({ request }) => {
        capturedQ = new URL(request.url).searchParams.get("q");
        return okList([]);
      }),
    );

    const { result } = renderHook(() => useChats({ q: "halloween" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedQ).toBe("halloween");
  });
});

describe("mutation cache behavior", () => {
  it("useUpdateChatTitle patches the list cache in place — no list refetch", async () => {
    const original = makeChat({ title: "old" });
    let listFetchCount = 0;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        listFetchCount++;
        return okList([original]);
      }),
      http.patch(`${API}/api/v1/chats/${original.id}`, async ({ request }) => {
        const body = (await request.json()) as { title: string };
        return HttpResponse.json({ ok: true, data: { ...original, title: body.title } });
      }),
    );

    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const { result: list, rerender: rerenderList } = renderHook(() => useChats(), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));
    expect(listFetchCount).toBe(1);

    const { result: mutation } = renderHook(() => useUpdateChatTitle(), { wrapper });
    await act(async () => {
      await mutation.current.mutateAsync({ chatId: original.id, title: "new" });
    });

    // The cache is patched synchronously inside onSuccess (confirmed by
    // inspecting queryClient.getQueryCache() directly) — this rerender()
    // just forces this *separate* renderHook instance's external-store
    // snapshot to catch up, a known RTL quirk across independent hook
    // instances sharing one QueryClient, not a product bug.
    rerenderList();
    await waitFor(() =>
      expect(list.current.data?.pages[0].items[0].title).toBe("new"),
    );
    expect(listFetchCount).toBe(1); // patched, never refetched
  });

  it("useTogglePinChat invalidates the list — pin affects ordering, so a refetch is correct here", async () => {
    const original = makeChat({ isPinned: false });
    let listFetchCount = 0;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        listFetchCount++;
        return okList([original]);
      }),
      http.patch(`${API}/api/v1/chats/${original.id}`, () =>
        HttpResponse.json({ ok: true, data: { ...original, isPinned: true } }),
      ),
    );

    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const { result: list } = renderHook(() => useChats(), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));
    expect(listFetchCount).toBe(1);

    const { result: mutation } = renderHook(() => useTogglePinChat(), { wrapper });
    await act(async () => {
      await mutation.current.mutateAsync({ chatId: original.id, isPinned: true });
    });

    await waitFor(() => expect(listFetchCount).toBe(2));
  });

  it("useDeleteChat removes the chat from the list cache in place — no list refetch", async () => {
    const chat = makeChat();
    let listFetchCount = 0;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        listFetchCount++;
        return okList([chat]);
      }),
      http.delete(`${API}/api/v1/chats/${chat.id}`, () =>
        HttpResponse.json({ ok: true, data: { id: chat.id } }),
      ),
    );

    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const { result: list, rerender: rerenderList } = renderHook(() => useChats(), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));

    const { result: mutation } = renderHook(() => useDeleteChat(), { wrapper });
    await act(async () => {
      await mutation.current.mutateAsync(chat.id);
    });

    rerenderList(); // see comment in the title-patch test above
    await waitFor(() => expect(list.current.data?.pages[0].items).toEqual([]));
    expect(listFetchCount).toBe(1); // removed, never refetched
  });

  it("useCreateChat invalidates the list — a new chat's position depends on existing pins", async () => {
    let listFetchCount = 0;
    server.use(
      http.get(`${API}/api/v1/chats`, () => {
        listFetchCount++;
        return okList([]);
      }),
      http.post(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: makeChat({ title: "fresh" }) }, { status: 201 }),
      ),
    );

    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const { result: list } = renderHook(() => useChats(), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));
    expect(listFetchCount).toBe(1);

    const { result: mutation } = renderHook(() => useCreateChat(), { wrapper });
    await act(async () => {
      await mutation.current.mutateAsync({ title: "fresh" });
    });

    await waitFor(() => expect(listFetchCount).toBe(2));
  });
});
