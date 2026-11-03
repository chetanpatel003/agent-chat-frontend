// @vitest-environment jsdom
// Regression: assistant prose was rendered as plain pre-wrapped text, so
// Markdown (headings, bold, lists, code) showed as raw "##", "**" and "```".
// One renderer now serves every assistant state; it must stay XSS-safe.
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { render, screen, within } from "@testing-library/react";
import type { MessageResponse } from "@/lib/api/contracts";
import { MessageList, type RunStatusSlot } from "./message-list";

const chatId = randomUUID();

function message(overrides: Partial<MessageResponse>): MessageResponse {
  return {
    id: randomUUID(),
    chatId,
    agentRunId: randomUUID(),
    role: "ASSISTANT",
    status: "COMPLETE",
    content: [],
    attachments: [],
    thinkingMs: null,
    runDurationMs: null,
    runQueueMs: null,
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const MD = [
  "## Steps",
  "",
  "This is **bold** and *italic* with `inline()`.",
  "",
  "- first",
  "- second",
  "",
  "1. one",
  "2. two",
  "",
  "```ts",
  "const x = 1;",
  "```",
].join("\n");

const text = (t: string) => [{ type: "text" as const, text: t }];

/** The structural Markdown elements every assistant state must produce. */
function expectRenderedMarkdown(container: HTMLElement) {
  // Scoped to the prose: the execution summary above it has its own list.
  const root = container.querySelector<HTMLElement>("[data-markdown]");
  if (!root) throw new Error("no rendered Markdown");
  expect(within(root).getByRole("heading", { name: "Steps" })).toBeInTheDocument();
  expect(root.querySelector("strong")).toHaveTextContent("bold");
  expect(root.querySelector("em")).toHaveTextContent("italic");
  expect(root.querySelector("ul")?.querySelectorAll("li")).toHaveLength(2);
  expect(root.querySelector("ol")?.querySelectorAll("li")).toHaveLength(2);
  const pre = root.querySelector("pre");
  expect(pre).not.toBeNull();
  expect(pre?.querySelector("code")).toHaveTextContent("const x = 1;");
  expect(pre?.querySelector("code")?.className).toContain("language-ts");
  expect(Array.from(root.querySelectorAll("code")).some((c) => c.textContent === "inline()")).toBe(true);
  // No raw syntax left over.
  expect(root.textContent).not.toMatch(/##|\*\*|```/);
}

describe("Markdown: one renderer for every assistant state", () => {
  it("completed message", () => {
    const { container } = render(<MessageList messages={[message({ content: text(MD) })]} />);
    expectRenderedMarkdown(container);
  });

  it("streaming message renders the same structure as its completed copy", () => {
    const pending = message({ status: "PENDING" });
    const streaming = render(<MessageList messages={[pending]} live={{ text: { messageId: pending.id, rounds: [MD] } }} />);
    expectRenderedMarkdown(streaming.container);
    const streamedHtml = streaming.container.querySelector("[data-markdown]")?.innerHTML;
    streaming.unmount();
    const completed = render(<MessageList messages={[message({ content: text(MD) })]} />);
    expect(completed.container.querySelector("[data-markdown]")?.innerHTML).toBe(streamedHtml);
  });

  it("text around a tool result (generated media) uses the same renderer", () => {
    const id = randomUUID();
    const { container } = render(
      <MessageList
        messages={[
          message({
            content: [
              { type: "tool_use", toolInvocationId: id, toolName: "generate_image", status: "COMPLETED", input: {} },
              { type: "tool_result", toolInvocationId: id, output: { images: ["https://cdn.example.com/a.png"] }, durationMs: 9000, creditsCharged: 10, error: null },
              ...text(MD),
            ],
          }),
        ]}
      />,
    );
    expectRenderedMarkdown(container);
    expect(screen.getByAltText("Generated image")).toBeInTheDocument();
  });

  it.each([
    ["interrupted (recovered)", { status: "PENDING", error: { code: "RUN_INTERRUPTED", message: "x" } }],
    ["failed", { status: "FAILED", error: { code: "STREAM_INTERRUPTED", message: "The stream was interrupted." } }],
    ["stopped", { status: "CANCELLED", error: { code: "CANCELLED_BY_USER", message: "" } }],
    ["recovered after refresh (re-fetched copy)", {}],
  ] as const)("%s message keeps its partial output as Markdown", (_label, overrides) => {
    const persisted = JSON.parse(JSON.stringify(message({ content: text(MD), ...overrides }))) as MessageResponse;
    const { container } = render(<MessageList messages={[persisted]} />);
    expectRenderedMarkdown(container);
  });

  it("a user's own text is shown as typed, not as Markdown", () => {
    render(<MessageList messages={[message({ role: "USER", content: text("**not bold** ## nope") })]} />);
    expect(screen.getByText("**not bold** ## nope")).toBeInTheDocument();
  });
});

describe("Markdown safety (untrusted model output)", () => {
  it("never renders raw HTML: no script, no event-handler elements, no iframes", () => {
    const { container } = render(
      <MessageList
        messages={[
          message({
            content: text('Hi <script>window.__pwned = 1</script> <img src="x" onerror="window.__pwned=1"> <iframe src="https://evil.example"></iframe> <b onclick="x()">b</b>'),
          }),
        ]}
      />,
    );
    expect(container.querySelector("script, iframe, img, b, [onerror], [onclick]")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(screen.getByRole("log")).toHaveTextContent("Hi");
  });

  it("drops javascript: and data: link targets; safe links open in a new tab without opener", () => {
    render(
      <MessageList
        messages={[
          message({ content: text("[bad](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [good](https://example.com/docs)") }),
        ]}
      />,
    );
    for (const name of ["bad", "data"]) {
      const href = screen.getByText(name).closest("a")?.getAttribute("href") ?? "";
      expect(href).not.toMatch(/^(javascript|data):/i);
    }
    const good = screen.getByRole("link", { name: "good" });
    expect(good).toHaveAttribute("href", "https://example.com/docs");
    expect(good).toHaveAttribute("target", "_blank");
    expect(good.getAttribute("rel")).toContain("noopener");
  });

  it("never loads Markdown images from model text (shows the alt text instead)", () => {
    const { container } = render(<MessageList messages={[message({ content: text("![a tracking pixel](https://evil.example/p.gif)") })]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("a tracking pixel")).toBeInTheDocument();
  });
});

describe("Outcome placement: status before the response", () => {
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it.each([
    ["failed", { status: "FAILED", error: { code: "TOOL_FAILED", message: "The merge failed." } }, "The merge failed."],
    ["stopped", { status: "CANCELLED", error: { code: "CANCELLED_BY_USER", message: "" } }, "Stopped."],
    ["interrupted", { status: "PENDING", error: { code: "RUN_INTERRUPTED", message: "x" } }, "Response interrupted"],
  ] as const)("%s: the outcome sits above the partial output it kept", (_label, overrides, label) => {
    render(<MessageList messages={[message({ content: text("Partial answer"), runDurationMs: 61_000, ...overrides })]} />);
    const outcome = screen.getByRole("status");
    expect(outcome).toHaveTextContent(label);
    expect(before(outcome, screen.getByText("Partial answer"))).toBe(true);
    expect(before(screen.getByText("Took 1m 01s"), outcome)).toBe(true); // execution details first
  });

  it("an in-progress message with its status line shows one indicator, not a second placeholder", () => {
    const runId = randomUUID();
    const slot: RunStatusSlot = { runId, node: <span role="status">Thinking…</span> };
    const { container } = render(<MessageList messages={[message({ agentRunId: runId, status: "PENDING" })]} runStatus={slot} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("[data-pending-placeholder]")).toBeNull();
  });
});
