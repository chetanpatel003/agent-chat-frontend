// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
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
    render(<MessageList messages={[pending]} />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("represents a failed assistant message distinctly", () => {
    const failed = makeMessage({ role: "ASSISTANT", status: "FAILED", content: [] });
    render(<MessageList messages={[failed]} />);
    expect(screen.getByText("Failed to generate a response.")).toBeInTheDocument();
  });

  it("joins only text-bearing content blocks, in order, skipping tool blocks", () => {
    const message = makeMessage({
      role: "ASSISTANT",
      content: [
        { type: "thinking", text: "considering…" },
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
