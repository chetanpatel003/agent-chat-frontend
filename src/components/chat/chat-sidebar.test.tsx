// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { ChatSidebar } from "./chat-sidebar";
import type { ChatResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const mockUseAuth = vi.mocked(useAuth);
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  push.mockClear();
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

describe("ChatSidebar", () => {
  it("loads and displays the user's existing chats via useChats", async () => {
    const chat = makeChat({ title: "Project kickoff" });
    server.use(
      http.get(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: { items: [chat], nextCursor: null, hasMore: false } }),
      ),
    );

    render(<ChatSidebar selectedChatId={undefined} />, { wrapper: createWrapper() });
    expect(await screen.findByText("Project kickoff")).toBeInTheDocument();
  });

  it("reflects a null title as a fallback label, not a crash", async () => {
    const chat = makeChat({ title: null });
    server.use(
      http.get(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: { items: [chat], nextCursor: null, hasMore: false } }),
      ),
    );

    render(<ChatSidebar selectedChatId={undefined} />, { wrapper: createWrapper() });
    expect(await screen.findByText("Untitled chat")).toBeInTheDocument();
  });

  it("creating a chat navigates to the newly created chat", async () => {
    const created = makeChat({ title: null });
    server.use(
      http.get(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: { items: [], nextCursor: null, hasMore: false } }),
      ),
      http.post(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: created }, { status: 201 }),
      ),
    );

    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<ChatSidebar selectedChatId={undefined} />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole("button", { name: /new chat/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/chat/${created.id}`));
  });

  it("shows an empty state when the user has no chats", async () => {
    server.use(
      http.get(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: { items: [], nextCursor: null, hasMore: false } }),
      ),
    );
    render(<ChatSidebar selectedChatId={undefined} />, { wrapper: createWrapper() });
    expect(await screen.findByText(/no chats yet/i)).toBeInTheDocument();
  });

  it("marks the selected chat clearly via aria-current", async () => {
    const chat = makeChat({ title: "Selected one" });
    server.use(
      http.get(`${API}/api/v1/chats`, () =>
        HttpResponse.json({ ok: true, data: { items: [chat], nextCursor: null, hasMore: false } }),
      ),
    );

    render(<ChatSidebar selectedChatId={chat.id} />, { wrapper: createWrapper() });
    const link = await screen.findByText("Selected one");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
