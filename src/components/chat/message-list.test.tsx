// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MessageList } from "./message-list";
import type { MessageResponse } from "@/lib/api/contracts";

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
    error: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageList", () => {
  it("distinguishes user messages from assistant messages", () => {
    const user = makeMessage({ role: "USER", content: [{ type: "text", text: "hi there" }] });
    const assistant = makeMessage({
      role: "ASSISTANT",
      content: [{ type: "text", text: "hello back" }],
    });
    render(<MessageList messages={[user, assistant]} />);

    const userBubble = screen.getByText("hi there").closest("[data-role]");
    const assistantBubble = screen.getByText("hello back").closest("[data-role]");
    expect(userBubble).toHaveAttribute("data-role", "USER");
    expect(assistantBubble).toHaveAttribute("data-role", "ASSISTANT");
  });

  it("represents a pending assistant message distinctly, not as a blank or completed bubble", () => {
    const pending = makeMessage({ role: "ASSISTANT", status: "PENDING", content: [] });
    const { container } = render(<MessageList messages={[pending]} />);
    // A visible (silent) placeholder; the status text lives in the run's one status line.
    expect(container.querySelector("[data-pending-placeholder]")).toBeInTheDocument();
    expect(screen.queryByText("(no text content)")).not.toBeInTheDocument();
  });

  it("represents a failed assistant message distinctly", () => {
    const failed = makeMessage({ role: "ASSISTANT", status: "FAILED", content: [] });
    render(<MessageList messages={[failed]} />);
    expect(screen.getByText("Failed to generate a response.")).toBeInTheDocument();
  });

  it("renders only text blocks — never thinking/reasoning, even if a payload contains them", () => {
    const message = makeMessage({
      role: "ASSISTANT",
      content: [
        { type: "thinking", text: "Let me check the available tools." },
        { type: "reasoning", text: "private summary" },
        { type: "text", text: "Hello!" },
      ],
    });
    render(<MessageList messages={[message]} />);
    expect(screen.getByText("Hello!")).toBeInTheDocument();
    expect(screen.queryByText(/Let me check the available tools/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private summary/)).not.toBeInTheDocument();
  });

  it("joins only text blocks, in order, skipping tool blocks", () => {
    const message = makeMessage({
      role: "ASSISTANT",
      content: [
        { type: "text", text: "considering…" },
        {
          type: "tool_use",
          toolInvocationId: randomUUID(),
          toolName: "generate_image",
          status: "RUNNING",
          input: {},
        },
        { type: "text", text: "here you go" },
      ],
    });
    render(<MessageList messages={[message]} />);
    expect(screen.getByText(/considering…/)).toBeInTheDocument();
    expect(screen.getByText(/here you go/)).toBeInTheDocument();
  });
});

describe("MessageList — sent attachments", () => {
  it("lists a user message's uploads by name in attachment order, without loading them from temporary storage", () => {
    const at = (order: number, filename: string, mimeType: string) => ({
      id: randomUUID(),
      messageId: null,
      source: "UPLOAD" as const,
      status: "READY" as const,
      mimeType,
      sizeBytes: 10,
      url: `https://tmp.transloadit.net/${filename}`,
      metadata: { filename },
      order,
      createdAt: new Date().toISOString(),
    });
    render(
      <MessageList
        messages={[
          makeMessage({
            content: [{ type: "text", text: "merge these" }],
            attachments: [at(0, "first.mp4", "video/mp4"), at(1, "second.png", "image/png")],
          }),
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Attached files" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["first.mp4", "second.png"]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("merge these")).toBeInTheDocument();
  });

  it("lists a user message's media-library picks too, generated ones included, in send order", () => {
    const at = (source: "UPLOAD" | "GENERATED", filename?: string) => ({
      id: randomUUID(),
      messageId: randomUUID(),
      source,
      status: "READY" as const,
      mimeType: "image/png",
      sizeBytes: 10,
      url: "https://s3.example.test/x.png",
      metadata: filename ? { filename } : {},
      order: 0,
      createdAt: new Date().toISOString(),
    });
    render(
      <MessageList
        messages={[
          makeMessage({
            content: [{ type: "text", text: "use these" }],
            attachments: [at("GENERATED"), at("UPLOAD", "mine.png")],
          }),
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Attached files" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Generated image", "mine.png"]);
  });

  it("does not list generated assets as attachment chips (they render inline from their tool result)", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            role: "ASSISTANT",
            content: [{ type: "text", text: "Here is your image." }],
            attachments: [
              {
                id: randomUUID(),
                messageId: null,
                source: "GENERATED",
                status: "READY",
                mimeType: "image/png",
                sizeBytes: 10,
                url: "https://s3.us-east-005.backblazeb2.test/agentChat/generated/x.png?X-Amz-Signature=abc",
                metadata: {},
                order: 0,
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        ]}
      />,
    );
    expect(screen.queryByRole("list", { name: "Attached files" })).not.toBeInTheDocument();
    expect(screen.getByText("Here is your image.")).toBeInTheDocument();
  });
});

// Mirrors the real persisted Kashmir message: thinking, tool_use,
// tool_result { output: { raw: { result, provider, creditUsed,
// resultMetadata }, images, creditUsed }, error: null }, thinking, text.
const URL_A = "https://g.tlcdn.com/gen/73c86197bc274af080c733e9d85594d4.png";
const URL_B = "https://static.magica.com/decd7c541b5e46839a3e417ae0e80330.png";

function toolPair(
  toolName: string,
  output: Record<string, unknown> | null,
  opts: { status?: "COMPLETED" | "FAILED"; error?: { code: string; message: string } | null; creditsCharged?: number | null } = {},
): MessageResponse["content"] {
  const toolInvocationId = randomUUID();
  return [
    { type: "tool_use", toolInvocationId, toolName, status: opts.status ?? "COMPLETED", input: { prompt: "Kashmir" } },
    { type: "tool_result", toolInvocationId, output, durationMs: 9000, creditsCharged: opts.creditsCharged ?? null, error: opts.error ?? null },
  ];
}

function magicaOutput(urls: unknown[]) {
  return {
    raw: {
      result: urls,
      provider: "fal",
      creditUsed: 273936,
      resultMetadata: [{ size: 1848830, width: 1024, height: 1024, modelId: "gpt-image-2", mimeType: "image/png", mediaType: "image" }],
    },
    images: urls,
    creditUsed: 273936,
  };
}

function assistant(content: MessageResponse["content"]) {
  return makeMessage({ role: "ASSISTANT", content });
}

describe("MessageList — generated images", () => {
  it("renders a successful generate_image result inline, keeping surrounding text and hiding thinking and provider metadata", () => {
    render(
      <MessageList
        messages={[
          assistant([
            { type: "thinking", text: "Let me check the available tools." },
            ...toolPair("generate_image", magicaOutput([URL_A])),
            { type: "thinking", text: "The image generation was successful." },
            { type: "text", text: "Here is your image of Kashmir." },
          ]),
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Generated image" })).toHaveAttribute("src", URL_A);
    expect(screen.getByText("Here is your image of Kashmir.")).toBeInTheDocument();
    expect(screen.queryByText(/Let me check the available tools/)).not.toBeInTheDocument();
    expect(screen.queryByText(/generation was successful/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fal|273936|gpt-image-2/)).not.toBeInTheDocument();
  });

  it("renders multiple images in their original order, interleaved with text in block order", () => {
    const { container } = render(
      <MessageList
        messages={[
          assistant([
            { type: "text", text: "Before." },
            ...toolPair("generate_image", magicaOutput([URL_A, URL_B])),
            { type: "text", text: "After." },
          ]),
        ]}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images.map((img) => img.getAttribute("src"))).toEqual([URL_A, URL_B]);
    expect(images[0]).toHaveAccessibleName("Generated image 1 of 2");
    const text = container.textContent ?? "";
    expect(text.indexOf("Before.")).toBeLessThan(text.indexOf("After."));
    const before = screen.getByText("Before.");
    expect(before.compareDocumentPosition(images[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(images[1].compareDocumentPosition(screen.getByText("After.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to raw.result when the normalised images field is absent", () => {
    const output = magicaOutput([URL_A]);
    delete (output as Partial<typeof output>).images;
    render(<MessageList messages={[assistant(toolPair("edit_image", output))]} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", URL_A);
  });

  it("does not render an image for a failed tool invocation", () => {
    render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("generate_image", magicaOutput([URL_A]), {
              status: "FAILED",
              error: { code: "PROVIDER_ERROR", message: "boom" },
            }),
            { type: "text", text: "Sorry, that failed." },
          ]),
        ]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Sorry, that failed.")).toBeInTheDocument();
  });

  it("does not crash on missing or malformed output", () => {
    render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("generate_image", null),
            ...toolPair("generate_image", { raw: "not-an-object", images: "nope" }),
            ...toolPair("generate_image", { raw: { result: [42, null, { url: URL_A }] } }),
            { type: "text", text: "still here" },
          ]),
        ]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("still here")).toBeInTheDocument();
  });

  it("rejects invalid and non-https image URLs", () => {
    render(
      <MessageList
        messages={[
          assistant(
            toolPair("generate_image", magicaOutput(["not a url", "http://insecure.example/a.png", "javascript:alert(1)", URL_B])),
          ),
        ]}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", URL_B);
  });

  it("shows a compact fallback when an image fails to load", () => {
    render(<MessageList messages={[assistant(toolPair("generate_image", magicaOutput([URL_A])))]} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Image failed to load");
  });

  it("does not render non-image tool results (e.g. merge_videos, whose URL is also normalised into images) as images", () => {
    render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("merge_videos", magicaOutput(["https://static.magica.com/merged.mp4"])),
            { type: "text", text: "Merged." },
          ]),
        ]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Merged.")).toBeInTheDocument();
  });

  it("renders a completed merge_videos result as an inline video, after the preceding text", () => {
    const { container } = render(
      <MessageList
        messages={[
          assistant([
            { type: "text", text: "Here is the merged clip." },
            ...toolPair("merge_videos", magicaOutput(["https://static.magica.com/merged.mp4"])),
          ]),
        ]}
      />,
    );
    const video = container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("https://static.magica.com/merged.mp4");
    expect(video?.getAttribute("aria-label")).toBe("Generated video");
    expect(video?.hasAttribute("controls")).toBe(true);
    const text = screen.getByText("Here is the merged clip.");
    expect(text.compareDocumentPosition(video as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("never renders a non-https merge output, and shows a fallback when the video fails to load", () => {
    const { container, rerender } = render(
      <MessageList messages={[assistant(toolPair("merge_videos", magicaOutput(["http://insecure.example/x.mp4"])))]} />,
    );
    expect(container.querySelector("video")).toBeNull();
    rerender(<MessageList messages={[assistant(toolPair("merge_videos", magicaOutput(["https://static.magica.com/m.mp4"])))]} />);
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);
    expect(screen.getByRole("status")).toHaveTextContent("Video failed to load");
  });

  it("never treats URLs in ordinary assistant text as generated images", () => {
    // Images come only from successful tool results, never from prose. (A
    // provider media URL in prose is also removed from the text — see the
    // "never appear as assistant prose" suite; an ordinary link stays text.)
    render(
      <MessageList
        messages={[assistant([{ type: "text", text: `See ${URL_A}` }]), assistant([{ type: "text", text: "Also https://example.com/a.png" }])]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("See")).toBeInTheDocument();
    expect(screen.getByText("Also https://example.com/a.png")).toBeInTheDocument();
  });

  it("renders text-only messages unchanged", () => {
    render(<MessageList messages={[assistant([{ type: "text", text: "just text" }])]} />);
    expect(screen.getByText("just text")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("(no text content)")).not.toBeInTheDocument();
  });
});

describe("MessageList — credit usage", () => {
  it("shows the settled credits under a generated result, with the exact value on hover", () => {
    render(<MessageList messages={[assistant(toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }))]} />);
    const usage = screen.getByText("273,936 credits charged");
    expect(usage).toHaveAttribute("title", "273,936 credits charged");
  });

  it("shows small charges exactly", () => {
    render(<MessageList messages={[assistant(toolPair("crop_image", magicaOutput([URL_A]), { creditsCharged: 5_000 }))]} />);
    expect(screen.getByText("5,000 credits charged")).toBeInTheDocument();
  });

  it("shows no usage (not a zero, not the provider's reported figure) when nothing was recorded", () => {
    // magicaOutput carries the provider's creditUsed; only the settled charge may be shown.
    render(<MessageList messages={[assistant(toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: null }))]} />);
    expect(screen.queryByText(/credits charged/)).not.toBeInTheDocument();
  });

  it("shows no usage for a plain model reply (OpenRouter Free turns cost no credits)", () => {
    render(<MessageList messages={[assistant([{ type: "text", text: "free answer" }])]} />);
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
  });
});

describe("MessageList — pending sends", () => {
  it("renders a pending send after the persisted messages, with its attachment chips in order", () => {
    render(
      <MessageList
        messages={[makeMessage({ content: [{ type: "text", text: "earlier" }] })]}
        pending={[
          {
            localId: "l1",
            chatId: randomUUID(),
            text: "new one",
            attachments: [
              { id: randomUUID(), name: "b.png", kind: "image" },
              { id: randomUUID(), name: "a.mp4", kind: "video" },
            ],
            serverMessageId: null,
          },
        ]}
      />,
    );
    const bubbles = screen.getByRole("log").querySelectorAll("[data-role]");
    expect(bubbles[1]).toHaveAttribute("data-pending", "true");
    expect(within(bubbles[1] as HTMLElement).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["b.png", "a.mp4"]);
    expect(within(bubbles[1] as HTMLElement).getByText("Sending…")).toBeInTheDocument();
  });
});

// Regression (2026-11-03): assistant prose showed a raw provider URL, a copied
// "Generated files (in order)" list and a signed B2 URL. Shapes are the exact
// persisted ones; the signature is fake.
const SIGNED_B2 =
  "https://s3.us-east-005.backblazeb2.com/agentChat/generated/01a19ae8-48cb-7e22-b227-711369ba1dd3/01a19db0-76ca-7baa-ae40-6ac488d6bb01-0.png" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=FAKEKEYID%2F20261102%2Fus-east-005%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef";

function visibleText(): string {
  return screen.getByRole("log").textContent ?? "";
}

describe("MessageList — media URLs never appear as assistant prose", () => {
  it("real generation whose reply echoes the image URL: image inline, usage shown, URL not in the text", () => {
    const failedFirst = toolPair("generate_image", null, {
      status: "FAILED",
      error: { code: "EXPLICIT_SIZE_REQUIRED", message: "Retry with an explicit size." },
    });
    render(
      <MessageList
        messages={[
          assistant([
            ...failedFirst,
            ...toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }),
            {
              type: "text",
              text: `Here's the new image with the couple facing the camera:\n\n${URL_A}\n\nThe image shows a young couple sitting on their balcony.`,
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Generated image" })).toHaveAttribute("src", URL_A);
    expect(screen.getByText("273,936 credits charged")).toBeInTheDocument();
    expect(screen.getByText(/Here's the new image with the couple facing the camera:/)).toBeInTheDocument();
    expect(screen.getByText(/The image shows a young couple/)).toBeInTheDocument();
    expect(visibleText()).not.toContain("g.tlcdn.com");
  });

  it("reply with no tool call that copied the context file list: no URL, no list, no signature — prose kept, no fake image", () => {
    render(
      <MessageList
        messages={[
          assistant([
            {
              type: "text",
              text:
                "I've generated the image with a sunset scene and a flight going by:\n\n" +
                "https://g.tlcdn.com/gen/171dd3a33e2f4c50a0f1e9a7d2c5bb98.png\n\n" +
                "The image shows a beautiful sunset with warm golden and orange colors.\n\n" +
                `Generated files (in order):\n1. image/png ${SIGNED_B2}`,
            },
          ]),
        ]}
      />,
    );
    const text = visibleText();
    expect(text).toContain("The image shows a beautiful sunset");
    expect(text).not.toMatch(/X-Amz|backblazeb2|tlcdn|Generated files|FAKEKEYID/);
    // Nothing was generated in that turn, so nothing is rendered as if it were.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/credits charged/)).not.toBeInTheDocument();
  });

  it("merge_videos: the video still plays, its echoed URL is not shown as text", () => {
    const VIDEO = "https://static.magica.com/merged.mp4";
    const { container } = render(
      <MessageList
        messages={[assistant([...toolPair("merge_videos", magicaOutput([VIDEO])), { type: "text", text: `Merged: ${VIDEO}` }])]}
      />,
    );
    expect(container.querySelector("video")?.getAttribute("src")).toBe(VIDEO);
    expect(visibleText()).not.toContain("static.magica.com");
    expect(screen.getByText("Merged:")).toBeInTheDocument();
  });

  it("keeps ordinary text and unrelated links, and leaves the user's own text untouched", () => {
    render(
      <MessageList
        messages={[
          makeMessage({ role: "USER", content: [{ type: "text", text: `crop ${URL_A}` }] }),
          assistant([{ type: "text", text: "See https://en.wikipedia.org/wiki/Gurgaon for background." }]),
        ]}
      />,
    );
    expect(screen.getByText("See https://en.wikipedia.org/wiki/Gurgaon for background.")).toBeInTheDocument();
    expect(screen.getByText(`crop ${URL_A}`)).toBeInTheDocument();
  });

  it("strips media URLs from live-streamed text too, including one still arriving", () => {
    const pending = makeMessage({ role: "ASSISTANT", status: "PENDING", content: [] });
    const { rerender } = render(
      <MessageList
        messages={[pending]}
        live={{ text: { messageId: pending.id, rounds: ["Here it is: https://g.tlcdn.com/gen/17"] } }}
      />,
    );
    expect(visibleText()).not.toContain("tlcdn");
    rerender(
      <MessageList
        messages={[pending]}
        live={{ text: { messageId: pending.id, rounds: [`Done.\n\nGenerated files (in order):\n1. image/png ${SIGNED_B2}\n`] } }}
      />,
    );
    expect(visibleText()).toContain("Done.");
    expect(visibleText()).not.toMatch(/X-Amz|Generated files/);
  });
});


// Credit usage as operation metadata (2026-11-03): one app-generated indicator
// per billable invocation, below its media; never the model's own statement.
describe("MessageList — credit usage presentation", () => {
  const usageIndicators = (root: HTMLElement) => root.querySelectorAll("[data-credit-usage]");

  it("1. a single image generation shows exactly one indicator, below the image and before the reply text", () => {
    const { container } = render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }),
            { type: "text", text: "Here's your generated image of a couple enjoying the sunset." },
          ]),
        ]}
      />,
    );
    expect(usageIndicators(container)).toHaveLength(1);
    const indicator = screen.getByText("273,936 credits charged");
    const image = screen.getByRole("img", { name: "Generated image" });
    const text = screen.getByText(/Here's your generated image/);
    expect(image.compareDocumentPosition(indicator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(indicator.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(indicator).toHaveAttribute("title", "273,936 credits charged");
  });

  it("2. a single video generation shows exactly one indicator", () => {
    const { container } = render(
      <MessageList messages={[assistant(toolPair("merge_videos", magicaOutput(["https://static.magica.com/m.mp4"]), { creditsCharged: 50_000 }))]} />,
    );
    expect(usageIndicators(container)).toHaveLength(1);
    expect(screen.getByText("50,000 credits charged")).toBeInTheDocument();
  });

  it("3. independent invocations each show their own usage, in output order, never summed", () => {
    const { container } = render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }),
            ...toolPair("crop_image", magicaOutput([URL_B]), { creditsCharged: 5_000 }),
          ]),
        ]}
      />,
    );
    expect([...usageIndicators(container)].map((e) => e.textContent)).toEqual(["273,936 credits charged", "5,000 credits charged"]);
    expect(screen.queryByText(/278,936/)).not.toBeInTheDocument();
  });

  it("4. several images from one invocation show its usage once", () => {
    const { container } = render(
      <MessageList messages={[assistant(toolPair("generate_image", magicaOutput([URL_A, URL_B]), { creditsCharged: 547_872 }))]} />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(usageIndicators(container)).toHaveLength(1);
  });

  it("5. an unsettled invocation shows no usage (no zero, no estimate)", () => {
    const { container } = render(<MessageList messages={[assistant(toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: null }))]} />);
    expect(usageIndicators(container)).toHaveLength(0);
    expect(screen.queryByText(/credits/)).not.toBeInTheDocument();
  });

  it("6. usage settled later appears in place, once", () => {
    const message = assistant(toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: null }));
    const { container, rerender } = render(<MessageList messages={[message]} />);
    expect(usageIndicators(container)).toHaveLength(0);
    const settled = {
      ...message,
      content: message.content.map((b) => (b.type === "tool_result" ? { ...b, creditsCharged: 273_936 } : b)),
    };
    rerender(<MessageList messages={[settled]} />);
    rerender(<MessageList messages={[settled]} />); // a repeated refetch
    expect(usageIndicators(container)).toHaveLength(1);
  });

  it("7–8. plain and OpenRouter Free text replies show no usage or token counts", () => {
    const { container } = render(
      <MessageList
        messages={[
          assistant([{ type: "text", text: "A free-model answer." }, { type: "usage", promptTokens: 120, completionTokens: 40, model: "x/y:free" }]),
        ]}
      />,
    );
    expect(usageIndicators(container)).toHaveLength(0);
    expect(screen.queryByText(/credit|token|120|40/i)).not.toBeInTheDocument();
  });

  it("9. the model's own credit statement is removed; the conversation stays", () => {
    render(
      <MessageList
        messages={[
          assistant([
            ...toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }),
            { type: "text", text: "Here's the new image of the sunset.\n\nIt used 273936 credits. Let me know if you'd like changes!" },
          ]),
        ]}
      />,
    );
    expect(screen.getByText(/Here's the new image of the sunset\./)).toHaveTextContent("Let me know if you'd like changes!");
    expect(screen.queryByText(/273936/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/credits charged/)).toHaveLength(1); // only the app's indicator
  });

  it("10. ordinary numbers and unrelated credit discussion stay", () => {
    const text = "Each high-quality image costs about 270,000 credits; you have 8.9M credits left. The flight leaves at 18:45.";
    render(<MessageList messages={[assistant([{ type: "text", text }])]} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("11. live streaming never shows the redundant credit statement, even mid-sentence", () => {
    const pending = makeMessage({ role: "ASSISTANT", status: "PENDING", content: [] });
    const { rerender } = render(<MessageList messages={[pending]} live={{ text: { messageId: pending.id, rounds: ["Here it is. It used 2739"] } }} />);
    expect(screen.getByRole("log").textContent).not.toMatch(/2739|used/);
    rerender(<MessageList messages={[pending]} live={{ text: { messageId: pending.id, rounds: ["Here it is. It used 273936 credits. Enjoy!"] } }} />);
    expect(screen.getByRole("log").textContent).toContain("Here it is. Enjoy!");
    expect(screen.getByRole("log").textContent).not.toMatch(/273936/);
  });

  it("12. a reload (fresh render from the same persisted data) presents the same", () => {
    const messages = [
      assistant([
        ...toolPair("generate_image", magicaOutput([URL_A]), { creditsCharged: 273_936 }),
        { type: "text" as const, text: "Here you go. It used 273936 credits." },
      ]),
    ];
    const first = render(<MessageList messages={messages} />);
    const before = first.container.innerHTML;
    first.unmount();
    const second = render(<MessageList messages={messages} />);
    expect(second.container.innerHTML).toBe(before);
    expect(second.container.querySelectorAll("[data-credit-usage]")).toHaveLength(1);
  });

  it("large amounts are abbreviated, with the exact amount on hover and for screen readers", () => {
    render(<MessageList messages={[assistant(toolPair("merge_videos", magicaOutput(["https://static.magica.com/m.mp4"]), { creditsCharged: 1_250_000 }))]} />);
    const indicator = screen.getByText(/1\.25M credits charged/);
    expect(indicator).toHaveAttribute("title", "1,250,000 credits charged");
    expect(indicator).toHaveTextContent("(1,250,000 credits charged)");
  });
});
