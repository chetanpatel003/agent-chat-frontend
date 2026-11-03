// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

type FakeUpload = { callbacks: { onComplete: (id: string) => unknown } };
const uploads: FakeUpload[] = [];
vi.mock("@/lib/uploads/transloadit-upload", () => ({
  startTransloaditUpload: vi.fn((_file: File, _authorize: unknown, callbacks: FakeUpload["callbacks"]) => {
    uploads.push({ callbacks });
    return { cancel: vi.fn() };
  }),
}));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { MessageComposer } from "./message-composer";
import type { AttachmentResponse } from "@/lib/api/contracts";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;
const CHAT_ID = randomUUID();
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function libraryItem(overrides: Partial<AttachmentResponse> = {}): AttachmentResponse {
  const id = randomUUID();
  return {
    id,
    messageId: randomUUID(),
    source: "UPLOAD",
    status: "READY",
    mimeType: "image/png",
    sizeBytes: 100,
    url: `https://s3.example.test/agentChat/uploads/u/${id}.png?X-Amz-Signature=sig`,
    metadata: { filename: `${id.slice(0, 4)}.png` },
    order: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const page = (items: AttachmentResponse[], nextCursor: string | null = null) =>
  HttpResponse.json({ ok: true, data: { items, nextCursor, hasMore: nextCursor !== null } });

let sentBodies: unknown[];
let libraryRequests: number;

beforeEach(() => {
  uploads.length = 0;
  sentBodies = [];
  libraryRequests = 0;
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
  } as any);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  server.use(
    http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, async ({ request }) => {
      sentBodies.push(await request.json());
      return HttpResponse.json({ ok: true, data: { chatId: CHAT_ID, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "t" } });
    }),
  );
});

function serveLibrary(...pages: ReturnType<typeof page>[]) {
  server.use(
    http.get(`${API}/api/v1/attachments/library`, () => {
      libraryRequests++;
      return pages[Math.min(libraryRequests - 1, pages.length - 1)];
    }),
  );
}

async function openPicker() {
  const user = userEvent.setup();
  render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
  await user.click(screen.getByRole("button", { name: "Choose from media library" }));
  return { user, dialog: await screen.findByRole("dialog", { name: "Media library" }) };
}

const composerItems = () => within(screen.getByRole("list", { name: "Attachments" })).getAllByRole("listitem");

describe("MediaPicker", () => {
  it("doesn't fetch the library until opened, then shows previews and filenames", async () => {
    const [a, b] = [libraryItem(), libraryItem({ mimeType: "video/mp4", metadata: {} , source: "GENERATED" })];
    serveLibrary(page([a, b]));
    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    expect(libraryRequests).toBe(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Choose from media library" }));
    const grid = await screen.findByRole("list", { name: "Media library" });
    expect(within(grid).getByRole("button", { name: a.metadata.filename! })).toBeInTheDocument();
    // Unnamed (generated) items carry their creation time, so two are never indistinguishable.
    expect(within(grid).getByRole("button", { name: /^Generated video, / })).toBeInTheDocument();
    expect(grid.querySelector("img")?.getAttribute("src")).toBe(a.url);
  });

  it("adds several picks in selection order, sends their existing ids in that order, and removes one locally", async () => {
    const [a, b, c] = [libraryItem(), libraryItem(), libraryItem()];
    serveLibrary(page([a, b, c]));
    const { user } = await openPicker();
    await user.click(await screen.findByRole("button", { name: c.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: a.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: b.metadata.filename! }));
    // Deselect and reselect b: it moves to the end of the order.
    await user.click(screen.getByRole("button", { name: b.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: b.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: "Add 3" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(composerItems().map((li) => li.getAttribute("aria-label"))).toEqual([
      `${c.metadata.filename}: From media library`,
      `${a.metadata.filename}: From media library`,
      `${b.metadata.filename}: From media library`,
    ]);

    await user.click(screen.getByRole("button", { name: `Remove ${a.metadata.filename}` }));
    await user.type(screen.getByLabelText("Message"), "use these");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sentBodies).toHaveLength(1));
    expect(sentBodies[0]).toEqual({ text: "use these", attachmentIds: [c.id, b.id], planMode: false });
  });

  it("keeps direct uploads and library picks in the order they were added", async () => {
    const pick = libraryItem();
    serveLibrary(page([pick]));
    let uploadedId = "";
    server.use(
      http.post(`${API}/api/v1/attachments`, async () => {
        uploadedId = randomUUID();
        return HttpResponse.json({ ok: true, data: libraryItem({ id: uploadedId, status: "PENDING", url: null, messageId: null }) }, { status: 201 });
      }),
      http.post(`${API}/api/v1/attachments/:id/upload-authorization`, () =>
        HttpResponse.json({ ok: true, data: { params: "{}", signature: "sha384:abc", expiresAt: new Date().toISOString() } }),
      ),
      http.post(`${API}/api/v1/attachments/:id/complete`, ({ params }) =>
        HttpResponse.json({ ok: true, data: libraryItem({ id: params.id as string, messageId: null }) }),
      ),
    );
    const user = userEvent.setup();
    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.upload(screen.getByLabelText("Attach files"), new File(["png"], "fresh.png", { type: "image/png" }));
    await waitFor(() => expect(uploads).toHaveLength(1));
    await act(async () => {
      await uploads[0].callbacks.onComplete("a".repeat(32));
    });
    await user.click(screen.getByRole("button", { name: "Choose from media library" }));
    await user.click(await screen.findByRole("button", { name: pick.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.type(screen.getByLabelText("Message"), "both");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sentBodies).toHaveLength(1));
    expect(sentBodies[0]).toMatchObject({ attachmentIds: [uploadedId, pick.id] });
  });

  it("marks items already in the composer and unavailable items, and can't select them", async () => {
    const [a, gone] = [libraryItem(), libraryItem({ url: null })];
    serveLibrary(page([a, gone]));
    const { user } = await openPicker();
    await user.click(await screen.findByRole("button", { name: a.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: "Add 1" }));
    await user.click(screen.getByRole("button", { name: "Choose from media library" }));
    expect(await screen.findByRole("button", { name: `${a.metadata.filename} (Already added)` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `${gone.metadata.filename} (Unavailable)` })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("stops selection at the per-message limit", async () => {
    const items = Array.from({ length: 12 }, () => libraryItem());
    serveLibrary(page(items));
    const { user } = await openPicker();
    await screen.findByRole("list", { name: "Media library" });
    for (const item of items.slice(0, 10)) await user.click(screen.getByRole("button", { name: item.metadata.filename! }));
    expect(screen.getByRole("button", { name: items[10].metadata.filename! })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add 10" })).toBeEnabled();
  });

  it("shows an empty state", async () => {
    serveLibrary(page([]));
    await openPicker();
    expect(await screen.findByText(/No media yet/)).toBeInTheDocument();
  });

  it("shows an error state with a working retry", async () => {
    const a = libraryItem();
    serveLibrary(
      HttpResponse.json({ ok: false, error: { code: "InternalError", message: "Something went wrong" } }, { status: 500 }),
      page([a]),
    );
    const { user } = await openPicker();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load your media.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: a.metadata.filename! })).toBeInTheDocument();
  });

  it("loads more pages on demand", async () => {
    const [a, b] = [libraryItem(), libraryItem()];
    serveLibrary(page([a], "cursor-1"), page([b]));
    const { user } = await openPicker();
    await screen.findByRole("button", { name: a.metadata.filename! });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("button", { name: b.metadata.filename! })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("Cancel discards the selection", async () => {
    const a = libraryItem();
    serveLibrary(page([a]));
    const { user } = await openPicker();
    await user.click(await screen.findByRole("button", { name: a.metadata.filename! }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("list", { name: "Attachments" })).not.toBeInTheDocument();
  });
});
