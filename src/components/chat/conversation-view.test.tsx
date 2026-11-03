// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRunWithStreams: vi.fn(() => ({ run: undefined, streams: {}, error: undefined, stop: vi.fn() })),
}));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { ConversationView } from "./conversation-view";
import type { MessageResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const mockUseAuth = vi.mocked(useAuth);
// Baseline: no active run for any chat, unless a test overrides it for
// its own chatId — ConversationView now also reads this (checkpoint
// 3.4.2) to gate the composer while a run is in flight.
const server = setupServer(
  http.get(`${API}/api/v1/chats/:chatId/runs/active`, () =>
    HttpResponse.json({ ok: true, data: null }),
  ),
);

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
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    error: null,
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

  it("while a run is active, the composer stays usable and sending interrupts that run (server-side, atomically)", async () => {
    const chatId = randomUUID();
    const runId = randomUUID();
    const now = new Date().toISOString();
    let sentBody: unknown = null;
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/${runId}/realtime-token`, () =>
        HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
      ),
      http.post(`${API}/api/v1/chats/${chatId}/messages`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          { ok: true, data: { chatId, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "run_x" } },
          { status: 202 },
        );
      }),
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () => okMessages([])),
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            id: runId,
            chatId,
            status: "RUNNING",
            waitingReason: null,
            model: null,
            promptTokens: null,
            completionTokens: null,
            turnCount: 1,
            planMode: false,
            errorCode: null,
            errorMessage: null,
            startedAt: now,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
            triggerRunId: `run_${randomUUID()}`,
          },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    const send = await screen.findByRole("button", { name: "Interrupt and send" });
    expect(screen.getByLabelText("Message")).toBeEnabled();
    await user.type(screen.getByLabelText("Message"), "do this instead");
    await user.click(send);
    await waitFor(() => expect(sentBody).toEqual({ text: "do this instead", attachmentIds: [], planMode: false, interruptRunId: runId }));
  });

  it("the active run's status (with Stop) sits in the conversation, above that run's in-progress answer", async () => {
    const chatId = randomUUID();
    const runId = randomUUID();
    const now = new Date().toISOString();
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/${runId}/realtime-token`, () =>
        HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
      ),
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () =>
        okMessages([
          makeMessage({ chatId, content: [{ type: "text", text: "merge these" }] }),
          makeMessage({ chatId, role: "ASSISTANT", agentRunId: runId, status: "PENDING", content: [{ type: "text", text: "Working on it." }] }),
        ]),
      ),
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            id: runId, chatId, status: "RUNNING", waitingReason: null, model: null, promptTokens: null,
            completionTokens: null, turnCount: 1, planMode: false, errorCode: null, errorMessage: null,
            startedAt: now, completedAt: null, createdAt: now, updatedAt: now, triggerRunId: `run_${randomUUID()}`,
          },
        }),
      ),
    );

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    const stop = await screen.findByRole("button", { name: "Stop" });
    const log = screen.getByRole("log");
    expect(log).toContainElement(stop);
    const status = screen.getByRole("status");
    expect(log).toContainElement(status);
    const answer = screen.getByText("Working on it.");
    expect(status.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
