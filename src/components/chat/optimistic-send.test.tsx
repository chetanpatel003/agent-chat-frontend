// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRunWithStreams: vi.fn(() => ({ run: undefined, streams: {}, error: undefined, stop: vi.fn() })),
}));

import { useAuth } from "@clerk/nextjs";
import { createTestQueryClient, createWrapper } from "@/test-utils/query-wrapper";
import { ConversationView } from "./conversation-view";
import { usePendingSends } from "@/stores/pending-sends";
import type { MessageResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const server = setupServer(
  http.get(`${API}/api/v1/chats/:chatId/runs/active`, () => HttpResponse.json({ ok: true, data: null })),
);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  usePendingSends.setState({ sends: [] });
});
afterAll(() => server.close());
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, only getToken/isSignedIn are used
  } as any);
});

function message(chatId: string, text: string, overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: randomUUID(),
    chatId,
    agentRunId: null,
    role: "USER",
    status: "COMPLETE",
    content: [{ type: "text", text }],
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    runQueueMs: null,
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const page = (items: MessageResponse[]) =>
  HttpResponse.json({ ok: true, data: { items, olderCursor: null, hasMore: false } });

/** A promise the test resolves to let the delayed admission respond. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, opened };
}

describe("optimistic send", () => {
  it("shows the message at once during a delayed admission, then reconciles to exactly one copy", async () => {
    const user = userEvent.setup();
    const chatId = randomUUID();
    const persisted: MessageResponse[] = [];
    const admission = gate();
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () => page(persisted)),
      http.post(`${API}/api/v1/chats/${chatId}/messages`, async () => {
        await admission.opened;
        const saved = message(chatId, "draw a cat");
        persisted.push(saved);
        return HttpResponse.json({
          ok: true,
          data: { chatId, messageId: saved.id, runId: randomUUID(), triggerRunId: "t1" },
        });
      }),
    );

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    await screen.findByText(/no messages yet/i);
    await user.type(screen.getByLabelText("Message"), "draw a cat");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // Before the server answers: visible, marked as sending, composer cleared.
    const log = screen.getByRole("log");
    expect(within(log).getByText("draw a cat")).toBeInTheDocument();
    expect(within(log).getByText("Sending…")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");

    admission.open();
    await waitFor(() => expect(within(screen.getByRole("log")).queryByText("Sending…")).not.toBeInTheDocument());
    expect(within(screen.getByRole("log")).getAllByText("draw a cat")).toHaveLength(1);
    expect(screen.getByRole("log").querySelector('[data-pending="true"]')).toBeNull();
  });

  it("removes the optimistic message and restores the draft when admission fails", async () => {
    const user = userEvent.setup();
    const chatId = randomUUID();
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () => page([])),
      http.post(`${API}/api/v1/chats/${chatId}/messages`, () =>
        HttpResponse.json({ ok: false, error: { code: "Conflict", message: "busy" } }, { status: 409 }),
      ),
    );

    render(<ConversationView chatId={chatId} />, { wrapper: createWrapper() });
    await screen.findByText(/no messages yet/i);
    await user.type(screen.getByLabelText("Message"), "will fail");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already in progress/i);
    expect(screen.getByLabelText("Message")).toHaveValue("will fail");
    expect(screen.queryByRole("log")).not.toBeInTheDocument(); // empty state again: no stray bubble
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });
});

describe("auto-scroll", () => {
  /** jsdom has no layout: give the viewport geometry the test controls. */
  function geometry(viewport: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, get: () => scrollHeight });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, get: () => clientHeight });
  }

  it("follows new content near the bottom, leaves a reader who scrolled up, and always scrolls on send", async () => {
    const user = userEvent.setup();
    const chatId = randomUUID();
    const queryClient = createTestQueryClient();
    let items = [message(chatId, "first")];
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/messages`, () => page(items)),
      http.post(`${API}/api/v1/chats/${chatId}/messages`, () =>
        HttpResponse.json({ ok: true, data: { chatId, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "t" } }),
      ),
    );
    const refetch = () => queryClient.invalidateQueries({ queryKey: ["messages", chatId] });

    const { container } = render(<ConversationView chatId={chatId} />, { wrapper: createWrapper(queryClient) });
    await screen.findByText("first");
    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("no viewport");

    // Near the bottom (within 80px): new content (e.g. a streamed reply) is followed.
    geometry(viewport, { scrollHeight: 2000, clientHeight: 500 });
    viewport.scrollTop = 1450;
    fireEvent.scroll(viewport);
    items = [...items, message(chatId, "second", { role: "ASSISTANT" })];
    await refetch();
    await screen.findByText("second");
    expect(viewport.scrollTop).toBe(2000);

    // Scrolled up to read history: new content does not move the reader.
    geometry(viewport, { scrollHeight: 3000, clientHeight: 500 });
    viewport.scrollTop = 200;
    fireEvent.scroll(viewport);
    items = [...items, message(chatId, "third", { role: "ASSISTANT" })];
    await refetch();
    await screen.findByText("third");
    expect(viewport.scrollTop).toBe(200);

    // Sending always brings the reader to their new message.
    geometry(viewport, { scrollHeight: 3400, clientHeight: 500 });
    await user.type(screen.getByLabelText("Message"), "my question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(viewport.scrollTop).toBe(3400);

    // Back at the bottom, following resumes.
    geometry(viewport, { scrollHeight: 3800, clientHeight: 500 });
    items = [...items, message(chatId, "fourth", { role: "ASSISTANT" })];
    await refetch();
    await screen.findByText("fourth");
    expect(viewport.scrollTop).toBe(3800);
  });
});
