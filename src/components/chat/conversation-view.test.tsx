// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { ConversationView } from "./conversation-view";
import type { MessageResponse } from "@/lib/api/contracts";

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

function makeMessage(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    agentRunId: null,
    role: "USER",
    status: "COMPLETE",
    content: [{ type: "text", text: "hello" }],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function okMessages(items: MessageResponse[]) {
  return HttpResponse.json({ ok: true, data: { items, olderCursor: null, hasMore: false } });
}

describe("ConversationView", () => {
  it("shows a 'select a chat' state when no chat is selected", () => {
    render(<ConversationView chatId={undefined} />, { wrapper: createWrapper() });
    expect(screen.getByText(/select a chat or start a new one/i)).toBeInTheDocument();
  });

  it("loads and displays a selected chat's messages via useMessages", async () => {
    const chatId = randomUUID();
    const message = makeMessage({ chatId, content: [{ type: "text", text: "from the real chat" }] });
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () => okMessages([message])),
    );

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    expect(await screen.findByText("from the real chat")).toBeInTheDocument();
  });

  it("shows an empty state for a chat with no messages yet", async () => {
    const chatId = randomUUID();
    server.use(http.get(`${API}/api/v1/chats/${chatId}/messages`, () => okMessages([])));

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the message fetch fails", async () => {
    const chatId = randomUUID();
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () =>
        HttpResponse.json(
          { ok: false, error: { code: "InternalError", message: "boom" } },
          { status: 500 },
        ),
      ),
    );

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    expect(await screen.findByText(/could not load this conversation/i)).toBeInTheDocument();
  });

  it("switching to a different chatId does not leak the previous chat's messages", async () => {
    const chatA = randomUUID();
    const chatB = randomUUID();
    server.use(
      http.get(`${API}/api/v1/chats/${chatA}/messages`, () =>
        okMessages([makeMessage({ chatId: chatA, content: [{ type: "text", text: "message in A" }] })]),
      ),
      http.get(`${API}/api/v1/chats/${chatB}/messages`, () =>
        okMessages([makeMessage({ chatId: chatB, content: [{ type: "text", text: "message in B" }] })]),
      ),
    );

    const { rerender } = render(<ConversationView chatId={chatA} />, { wrapper: createWrapper() });
    expect(await screen.findByText("message in A")).toBeInTheDocument();

    rerender(<ConversationView chatId={chatB} />);
    expect(await screen.findByText("message in B")).toBeInTheDocument();
    expect(screen.queryByText("message in A")).not.toBeInTheDocument();
  });
});
