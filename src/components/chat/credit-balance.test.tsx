// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createTestQueryClient, createWrapper } from "@/test-utils/query-wrapper";
import { CREDIT_BALANCE_KEY } from "@/hooks/use-credits";
import { CreditBalance } from "./credit-balance";

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

describe("CreditBalance", () => {
  it("shows a loading state, then the balance labelled as credits", async () => {
    server.use(http.get(`${API}/api/v1/credits/balance`, () => HttpResponse.json({ ok: true, data: { balance: 9_178_192 } })));
    render(<CreditBalance />, { wrapper: createWrapper() });
    expect(screen.getByText("Loading credit balance")).toBeInTheDocument();
    const value = await screen.findByText("9.18M credits");
    expect(value).toHaveAttribute("aria-label", "Credit balance: 9,178,192 credits");
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
  });

  it("refreshes when the balance query is invalidated (as after a settlement)", async () => {
    let balance = 9_178_192;
    server.use(http.get(`${API}/api/v1/credits/balance`, () => HttpResponse.json({ ok: true, data: { balance } })));
    const queryClient = createTestQueryClient();
    render(<CreditBalance />, { wrapper: createWrapper(queryClient) });
    await screen.findByText("9.18M credits");
    balance -= 273_936;
    await queryClient.invalidateQueries({ queryKey: CREDIT_BALANCE_KEY });
    expect(await screen.findByText("8.90M credits")).toBeInTheDocument();
  });

  it("shows a compact, retryable error state", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get(`${API}/api/v1/credits/balance`, () =>
        fail
          ? HttpResponse.json({ ok: false, error: { code: "Internal", message: "x" } }, { status: 500 })
          : HttpResponse.json({ ok: true, data: { balance: 5_000 } }),
      ),
    );
    render(<CreditBalance />, { wrapper: createWrapper() });
    const retry = await screen.findByRole("button", { name: /credits unavailable/i });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText("5,000 credits")).toBeInTheDocument();
  });
});
