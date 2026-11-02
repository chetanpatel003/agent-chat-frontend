// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { MessageComposer } from "./message-composer";

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

const CHAT_ID = randomUUID();

function okResponse() {
  return HttpResponse.json({
    ok: true,
    data: { chatId: CHAT_ID, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "t1" },
  });
}

describe("MessageComposer", () => {
  it("sends through the real endpoint with a non-empty Idempotency-Key header, and clears on success", async () => {
    const user = userEvent.setup();
    let capturedKey: string | null = null;
    let capturedBody: unknown = null;
    server.use(
      http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, async ({ request }) => {
        capturedKey = request.headers.get("idempotency-key");
        capturedBody = await request.json();
        return okResponse();
      }),
    );

    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.type(screen.getByLabelText("Message"), "hello world");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));
    expect(capturedKey).toBeTruthy();
    expect(capturedBody).toEqual({ text: "hello world" });
  });

  it("prevents a duplicate submission while one is already in flight", async () => {
    const user = userEvent.setup();
    let callCount = 0;
    server.use(
      http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return okResponse();
      }),
    );

    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.type(screen.getByLabelText("Message"), "double click me");
    const button = screen.getByRole("button", { name: "Send" });
    await user.click(button);
    // The button disables itself the instant the mutation becomes
    // pending; a second click while it's disabled must not fire a
    // second request.
    await user.click(button);

    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));
    expect(callCount).toBe(1);
  });

  it("preserves the draft and reuses the same Idempotency-Key when retrying an unchanged, failed send", async () => {
    const user = userEvent.setup();
    const capturedKeys: (string | null)[] = [];
    let attempt = 0;
    server.use(
      http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, ({ request }) => {
        attempt++;
        capturedKeys.push(request.headers.get("idempotency-key"));
        if (attempt === 1) {
          return HttpResponse.json(
            { ok: false, error: { code: "DispatchFailed", message: "could not start" } },
            { status: 502 },
          );
        }
        return okResponse();
      }),
    );

    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.type(screen.getByLabelText("Message"), "retry me");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Could not send that message.");
    // The draft text must still be there — it was never cleared.
    expect(screen.getByLabelText("Message")).toHaveValue("retry me");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toBeTruthy();
    expect(capturedKeys[0]).toBe(capturedKeys[1]); // same key, same unchanged request
  });

  it("generates a new Idempotency-Key when the draft is edited after a failure", async () => {
    const user = userEvent.setup();
    const capturedKeys: (string | null)[] = [];
    let attempt = 0;
    server.use(
      http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, ({ request }) => {
        attempt++;
        capturedKeys.push(request.headers.get("idempotency-key"));
        if (attempt === 1) {
          return HttpResponse.json(
            { ok: false, error: { code: "DispatchFailed", message: "could not start" } },
            { status: 502 },
          );
        }
        return okResponse();
      }),
    );

    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.type(screen.getByLabelText("Message"), "first attempt");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Could not send that message.");

    // Edit the draft instead of clicking Retry — this is a new
    // intentional send, not a retry of the same request.
    await user.type(screen.getByLabelText("Message"), " edited");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).not.toBe(capturedKeys[1]);
  });

  it("does not send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, () => {
        called = true;
        return okResponse();
      }),
    );

    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.type(screen.getByLabelText("Message"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(false);
  });
});
