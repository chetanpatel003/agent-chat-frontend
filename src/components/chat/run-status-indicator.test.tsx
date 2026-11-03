// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));
vi.mock("@trigger.dev/react-hooks", () => ({ useRealtimeRunWithStreams: vi.fn() }));

import { useAuth } from "@clerk/nextjs";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { createWrapper } from "@/test-utils/query-wrapper";
import { RunStatusIndicator } from "./run-status-indicator";
import type { AgentRunResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;

const mockUseAuth = vi.mocked(useAuth);
const mockUseRealtimeRun = vi.mocked(useRealtimeRunWithStreams);
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
  mockUseRealtimeRun.mockReturnValue({ run: undefined, streams: {}, error: undefined, stop: vi.fn() });
});

function makeRun(overrides: Partial<AgentRunResponse> = {}): AgentRunResponse {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    chatId: randomUUID(),
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
    ...overrides,
  };
}

describe("RunStatusIndicator", () => {
  it("renders nothing when no run is active", async () => {
    const chatId = randomUUID();
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () =>
        HttpResponse.json({ ok: true, data: null }),
      ),
    );
    const { container } = render(<RunStatusIndicator chatId={chatId} />, { wrapper: createWrapper() });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the live run status and tool activity while a run is active", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId, status: "RUNNING" });
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () =>
        HttpResponse.json({ ok: true, data: run }),
      ),
      http.get(`${API}/api/v1/chats/${chatId}/runs/${run.id}/realtime-token`, () =>
        HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
      ),
    );
    mockUseRealtimeRun.mockReturnValue({
      run: {
        status: "EXECUTING",
        isCompleted: false,
        isFailed: false,
        isCancelled: false,
        metadata: {
          events: [
            {
              type: "run_status",
              runId: run.id,
              seq: 1,
              at: new Date().toISOString(),
              status: "RUNNING",
            },
            {
              type: "tool_started",
              runId: run.id,
              seq: 2,
              at: new Date().toISOString(),
              toolInvocationId: randomUUID(),
              toolName: "generate_image",
            },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      error: undefined,
      streams: {},
      stop: vi.fn(),
    });

    render(<RunStatusIndicator chatId={chatId} />, { wrapper: createWrapper() });
    // Status model: a running tool is named by its lifecycle phase, with its elapsed time
    // (no display on this event, so the neutral name derived from the tool name).
    expect(await screen.findByRole("status")).toHaveTextContent(/^Calling Generate image…\s*\d+s$/);
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("clicking Stop sends a cancellation request for the active run's id", async () => {
    const chatId = randomUUID();
    const run = makeRun({ chatId });
    let capturedRunId: string | null = null;
    server.use(
      http.get(`${API}/api/v1/chats/${chatId}/runs/active`, () =>
        HttpResponse.json({ ok: true, data: run }),
      ),
      http.get(`${API}/api/v1/chats/${chatId}/runs/${run.id}/realtime-token`, () =>
        HttpResponse.json({ ok: true, data: { token: "tok_fake" } }),
      ),
      http.post(`${API}/api/v1/chats/${chatId}/runs/:runId/cancel`, ({ params }) => {
        capturedRunId = params.runId as string;
        return HttpResponse.json({ ok: true, data: { ...run, status: "CANCELLED" } });
      }),
    );

    const user = userEvent.setup();
    render(<RunStatusIndicator chatId={chatId} />, { wrapper: createWrapper() });
    const stopButton = await screen.findByRole("button", { name: /stop/i });
    await user.click(stopButton);

    await waitFor(() => expect(capturedRunId).toBe(run.id));
  });
});
