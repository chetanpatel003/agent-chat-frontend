// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn(), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </a>
  ),
}));
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRunWithStreams: vi.fn(() => ({ run: undefined, streams: {}, error: undefined, stop: vi.fn() })),
}));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { ChatWorkspace } from "./chat-workspace";

// jsdom has no ResizeObserver; the Radix sheet only needs it to exist.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("t"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
  } as any);
});

describe("ChatWorkspace — mobile chat list", () => {
  it("stays open while searching or pinning, and closes when a chat is opened", async () => {
    const now = new Date().toISOString();
    const chat = { id: randomUUID(), title: "Trip notes", isPinned: false, lastMessageAt: now, createdAt: now, updatedAt: now };
    server.use(
      http.get(`${API}/api/v1/chats`, () => HttpResponse.json({ ok: true, data: { items: [chat], nextCursor: null, hasMore: false } })),
    );
    const user = userEvent.setup();
    render(<ChatWorkspace selectedChatId={undefined} />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Open chat list" }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("searchbox", { name: "Search chats" }), "trip");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(await within(sheet).findByRole("link", { name: "Trip notes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
