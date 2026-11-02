"use client";

import { cn } from "@/lib/utils";
import type { MessageResponse } from "@/lib/api/contracts";

/**
 * Deliberately minimal: joins every content block that carries plain
 * text (text/thinking/reasoning), in order, and skips everything else
 * (tool_use/tool_result/citation/usage) rather than rendering a card
 * for them — advanced content-block rendering is explicitly out of
 * scope for this checkpoint (Phase 3.4.1 §5).
 */
function renderableText(message: MessageResponse): string {
  return message.content
    .filter((b) => b.type === "text" || b.type === "thinking" || b.type === "reasoning")
    .map((b) => (b as { text: string }).text)
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
}

function MessageBubble({ message }: { message: MessageResponse }) {
  const isUser = message.role === "USER";
  const text = renderableText(message);

  let body: React.ReactNode = text;
  if (message.status === "PENDING") {
    body = <span className="text-muted-foreground italic">Thinking…</span>;
  } else if (message.status === "FAILED") {
    body = <span className="text-destructive">Failed to generate a response.</span>;
  } else if (message.status === "CANCELLED") {
    body = <span className="text-muted-foreground italic">Cancelled.</span>;
  } else if (!text) {
    body = <span className="text-muted-foreground italic">(no text content)</span>;
  }

  return (
    <div
      data-role={message.role}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {body}
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: MessageResponse[] }) {
  return (
    <div className="flex flex-col gap-3 py-2" role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
