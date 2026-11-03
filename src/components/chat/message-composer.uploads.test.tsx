// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

type FakeUpload = {
  file: File;
  authorize: () => Promise<{ params: string; signature: string }>;
  callbacks: { onProgress: (f: number) => void; onComplete: (id: string) => unknown; onError: () => void };
  cancel: ReturnType<typeof vi.fn>;
};
const uploads: FakeUpload[] = [];
vi.mock("@/lib/uploads/transloadit-upload", () => ({
  startTransloaditUpload: vi.fn((file: File, authorize: FakeUpload["authorize"], callbacks: FakeUpload["callbacks"]) => {
    const cancel = vi.fn();
    uploads.push({ file, authorize, callbacks, cancel });
    return { cancel };
  }),
}));

import { useAuth } from "@clerk/nextjs";
import { createWrapper } from "@/test-utils/query-wrapper";
import { MessageComposer } from "./message-composer";

const API = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API;
const CHAT_ID = randomUUID();
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let created: { id: string; filename: string; chatId?: string }[];
let completed: { id: string; assemblyId: string }[];
let cancelled: string[];
let sentBodies: unknown[];

function attachmentJson(id: string, status: string, filename = "f") {
  return {
    id,
    messageId: null,
    source: "UPLOAD",
    status,
    mimeType: "image/png",
    sizeBytes: 3,
    url: status === "READY" ? `https://tmp.transloadit.net/${id}.png` : null,
    metadata: { filename },
    order: 0,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  uploads.length = 0;
  created = [];
  completed = [];
  cancelled = [];
  sentBodies = [];
  vi.mocked(useAuth).mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
  } as any);
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
  URL.revokeObjectURL = vi.fn();
  server.use(
    http.post(`${API}/api/v1/attachments`, async ({ request }) => {
      const body = (await request.json()) as { filename: string; chatId?: string };
      const id = randomUUID();
      created.push({ id, filename: body.filename, chatId: body.chatId });
      return HttpResponse.json({ ok: true, data: attachmentJson(id, "PENDING", body.filename) }, { status: 201 });
    }),
    http.post(`${API}/api/v1/attachments/:id/upload-authorization`, () =>
      HttpResponse.json({ ok: true, data: { params: "{}", signature: "sha384:abc", expiresAt: new Date().toISOString() } }),
    ),
    http.post(`${API}/api/v1/attachments/:id/complete`, async ({ params, request }) => {
      const { assemblyId } = (await request.json()) as { assemblyId: string };
      completed.push({ id: params.id as string, assemblyId });
      return HttpResponse.json({ ok: true, data: attachmentJson(params.id as string, "READY") });
    }),
    http.post(`${API}/api/v1/attachments/:id/cancel`, ({ params }) => {
      cancelled.push(params.id as string);
      return HttpResponse.json({ ok: true, data: attachmentJson(params.id as string, "CANCELLED") });
    }),
    http.post(`${API}/api/v1/chats/${CHAT_ID}/messages`, async ({ request }) => {
      sentBodies.push(await request.json());
      return HttpResponse.json({
        ok: true,
        data: { chatId: CHAT_ID, messageId: randomUUID(), runId: randomUUID(), triggerRunId: "t1" },
      });
    }),
  );
});

/** Simulates an Uppy callback inside an awaited act scope (onComplete is async). */
const fire = (fn: () => unknown) =>
  act(async () => {
    await fn();
  });

const png = (name: string) => new File(["png"], name, { type: "image/png" });
const ASSEMBLY = (i: number) => `${i}`.padStart(32, "a");

async function setup(files: File[]) {
  const user = userEvent.setup();
  render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
  await user.upload(screen.getByLabelText("Attach files"), files);
  await waitFor(() => expect(uploads).toHaveLength(files.filter((f) => f.type === "image/png").length));
  return user;
}

function item(name: string) {
  return screen.getByRole("listitem", { name: new RegExp(`^${name.replace(".", "\\.")}:`) });
}

describe("MessageComposer — uploads", () => {
  it("adds selected files in order with optimistic previews, creating one attachment per file for this chat", async () => {
    await setup([png("a.png"), png("b.png")]);
    const items = within(screen.getByRole("list", { name: "Attachments" })).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual(["a.png: Uploading", "b.png: Uploading"]);
    expect(items[0].querySelector("img")).toHaveAttribute("src", "blob:preview-1");
    await waitFor(() => expect(created).toHaveLength(2));
    expect(created.map((c) => [c.filename, c.chatId]).sort()).toEqual([
      ["a.png", CHAT_ID],
      ["b.png", CHAT_ID],
    ]);
  });

  it("authorizes each upload through the backend, not with any client-held secret", async () => {
    await setup([png("a.png")]);
    await expect(uploads[0].authorize()).resolves.toEqual({ params: "{}", signature: "sha384:abc", expiresAt: expect.any(String) });
  });

  it("shows per-file progress", async () => {
    await setup([png("a.png")]);
    await fire(() => uploads[0].callbacks.onProgress(0.42));
    expect(screen.getByRole("progressbar", { name: "Uploading a.png" })).toHaveAttribute("aria-valuenow", "42");
  });

  it("cancels an in-flight upload, tells the backend, and ignores a late completion", async () => {
    const user = await setup([png("a.png")]);
    await user.click(screen.getByRole("button", { name: "Cancel upload of a.png" }));
    expect(uploads[0].cancel).toHaveBeenCalled();
    expect(item("a.png")).toHaveAttribute("data-status", "cancelled");
    await waitFor(() => expect(cancelled).toEqual([created[0].id]));

    await fire(() => uploads[0].callbacks.onComplete(ASSEMBLY(1)));
    await new Promise((r) => setTimeout(r, 20));
    expect(completed).toHaveLength(0);
    expect(item("a.png")).toHaveAttribute("data-status", "cancelled");
  });

  it("shows a failed upload and retries it to completion with a fresh upload of the same attachment", async () => {
    const user = await setup([png("a.png")]);
    await fire(() => uploads[0].callbacks.onError());
    expect(item("a.png")).toHaveAttribute("data-status", "failed");
    expect(within(item("a.png")).getByText("Upload failed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry upload of a.png" }));
    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(created).toHaveLength(1);
    await fire(() => uploads[1].callbacks.onComplete(ASSEMBLY(2)));
    await waitFor(() => expect(item("a.png")).toHaveAttribute("data-status", "ready"));
    expect(completed).toEqual([{ id: created[0].id, assemblyId: ASSEMBLY(2) }]);
  });

  it("marks an upload failed when the backend refuses to verify it", async () => {
    server.use(
      http.post(`${API}/api/v1/attachments/:id/complete`, () =>
        HttpResponse.json({ ok: false, error: { code: "ValidationError", message: "nope" } }, { status: 400 }),
      ),
    );
    await setup([png("a.png")]);
    await fire(() => uploads[0].callbacks.onComplete(ASSEMBLY(1)));
    await waitFor(() => expect(item("a.png")).toHaveAttribute("data-status", "failed"));
    expect(within(item("a.png")).getByText("Upload could not be verified")).toBeInTheDocument();
  });

  it("rejects unsupported files locally without creating an attachment", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<MessageComposer chatId={CHAT_ID} />, { wrapper: createWrapper() });
    await user.upload(screen.getByLabelText("Attach files"), new File(["x"], "doc.pdf", { type: "application/pdf" }));
    expect(item("doc.pdf")).toHaveAttribute("data-status", "rejected");
    expect(within(item("doc.pdf")).getByText("Unsupported file type")).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });

  it("blocks sending while uploads are unfinished, then sends attachment ids in the order files were added", async () => {
    const user = await setup([png("a.png"), png("b.png"), png("c.png")]);
    await waitFor(() => expect(created).toHaveLength(3));
    await user.type(screen.getByLabelText("Message"), "edit these");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Wait for uploads to finish")).toBeInTheDocument();

    // Attachment creation runs in parallel, so the server sees creates in
    // any order; look everything up by filename. Complete out of order: c, a, b.
    const upload = (name: string) => uploads.find((u) => u.file.name === name)!;
    const idOf = (name: string) => created.find((c) => c.filename === name)!.id;
    await fire(() => upload("c.png").callbacks.onComplete(ASSEMBLY(3)));
    await fire(() => upload("a.png").callbacks.onComplete(ASSEMBLY(1)));
    await waitFor(() => expect(completed).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await fire(() => upload("b.png").callbacks.onComplete(ASSEMBLY(2)));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sentBodies).toHaveLength(1));
    expect(sentBodies[0]).toEqual({ text: "edit these", attachmentIds: [idOf("a.png"), idOf("b.png"), idOf("c.png")], planMode: false });
    await waitFor(() => expect(screen.queryByRole("list", { name: "Attachments" })).not.toBeInTheDocument());
  });

  it("blocks sending with a failed upload until it is removed", async () => {
    const user = await setup([png("a.png"), png("b.png")]);
    await waitFor(() => expect(created).toHaveLength(2));
    const upload = (name: string) => uploads.find((u) => u.file.name === name)!;
    await fire(() => upload("a.png").callbacks.onError());
    await fire(() => upload("b.png").callbacks.onComplete(ASSEMBLY(2)));
    await waitFor(() => expect(item("b.png")).toHaveAttribute("data-status", "ready"));
    await user.type(screen.getByLabelText("Message"), "hi");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Remove or retry failed uploads")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sentBodies).toHaveLength(1));
    expect(sentBodies[0]).toEqual({ text: "hi", attachmentIds: [created.find((c) => c.filename === "b.png")!.id], planMode: false });
  });
});
