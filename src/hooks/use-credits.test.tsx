// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { useCreditBalance, useCreditLedger } from "./use-credits";

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

describe("useCreditBalance", () => {
  it("fetches and validates the balance", async () => {
    server.use(
      http.get(`${API}/api/v1/credits/balance`, () =>
        HttpResponse.json({ ok: true, data: { balance: 1500 } }),
      ),
    );
    const { result } = renderHook(() => useCreditBalance(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.balance).toBe(1500);
  });

  it("does not fetch when signed out", async () => {
    mockUseAuth.mockReturnValue({
      getToken: vi.fn(),
      isSignedIn: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    let called = false;
    server.use(
      http.get(`${API}/api/v1/credits/balance`, () => {
        called = true;
        return HttpResponse.json({ ok: true, data: { balance: 0 } });
      }),
    );
    renderHook(() => useCreditBalance(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(false);
  });
});

describe("useCreditLedger", () => {
  it("fetches the first page", async () => {
    const entry = {
      id: randomUUID(),
      amount: -100,
      type: "TOOL_CHARGE" as const,
      balanceAfter: 900,
      description: "crop_image",
      toolInvocationId: null,
      createdAt: new Date().toISOString(),
    };
    server.use(
      http.get(`${API}/api/v1/credits/ledger`, () =>
        HttpResponse.json({ ok: true, data: { items: [entry], nextCursor: null, hasMore: false } }),
      ),
    );
    const { result } = renderHook(() => useCreditLedger(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].items).toEqual([entry]);
  });
});
