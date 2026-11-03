"use client";

import { FileVideo, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeAssistantText, type MessageResponse } from "@/lib/api/contracts";
import { IMAGE_TOOLS, VIDEO_TOOLS } from "@/lib/media-tools";
import type { LiveText } from "@/hooks/use-run-activity";
import { GeneratedImage } from "./generated-image";
import { GeneratedVideo } from "./generated-video";
import { libraryName } from "@/hooks/use-composer-attachments";
import { exactCredits, formatCredits } from "@/lib/credits";
import type { PendingSend } from "@/stores/pending-sends";

type AttachmentChip = { id: string; name: string; kind: "image" | "video" };

function chipsOf(attachments: MessageResponse["attachments"]): AttachmentChip[] {
  return attachments.map((a) => ({
    id: a.id,
    name: libraryName(a),
    kind: a.mimeType.startsWith("video/") ? "video" : "image",
  }));
}

/** A user message's attachments (uploads and media-library picks), listed by name in send order. */
function SentAttachments({ attachments }: { attachments: AttachmentChip[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul aria-label="Attached files" className="flex flex-wrap gap-1.5">
      {attachments.map(({ id, name, kind }) => {
        const Icon = kind === "video" ? FileVideo : ImageIcon;
        return (
          <li key={id} className="flex max-w-full items-center gap-1 rounded-md bg-background/20 px-2 py-1 text-xs">
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{name}</span>
          </li>
        );
      })}
    </ul>
  );
}


type Segment =
  | { kind: "text"; key: string; text: string }
  | { kind: "images"; key: string; urls: string[]; credits: number | null }
  | { kind: "videos"; key: string; urls: string[]; credits: number | null };

function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Legacy raw fields per tool, for rows persisted before the backend wrote canonical `images`. */
const RAW_FALLBACK_FIELDS: Record<string, readonly string[]> = {
  generate_image: ["result"],
  edit_image: ["result"],
  crop_image: ["image_url", "result"],
  merge_videos: ["video_url", "result"],
};

/**
 * Provider URLs from a persisted Magica tool output `{ raw, images?, creditUsed? }`:
 * the backend's canonical `images` (tools/magica-output.ts — the same list
 * archival uses), else the tool's raw field for older rows. Only https.
 */
function providerUrls(toolName: string, output: Record<string, unknown> | null): string[] {
  if (!output) return [];
  if (Array.isArray(output.images)) return output.images.filter(isSafeImageUrl);
  const raw = output.raw && typeof output.raw === "object" ? (output.raw as Record<string, unknown>) : null;
  for (const field of RAW_FALLBACK_FIELDS[toolName] ?? []) {
    const value = raw?.[field];
    const urls = (Array.isArray(value) ? value : [value]).filter(isSafeImageUrl);
    if (urls.length > 0) return urls;
  }
  return [];
}

/**
 * M3: each output prefers its archived copy (our B2 object, a fresh signed URL
 * from the messages API) over the provider's URL, which may expire; the
 * provider URL is used only for an output that hasn't been archived (yet).
 */
function mediaUrls(message: MessageResponse, toolInvocationId: string, fromProvider: string[]): string[] {
  const archived = new Map(
    (message.attachments ?? [])
      .filter((a) => a.source === "GENERATED" && a.toolInvocationId === toolInvocationId && a.status === "READY" && isSafeImageUrl(a.url))
      .map((a) => [a.order, a.url as string]),
  );
  const count = Math.max(fromProvider.length, ...[...archived.keys()].map((order) => order + 1), 0);
  return Array.from({ length: count }, (_, i) => archived.get(i) ?? fromProvider[i]).filter((u): u is string => !!u);
}

/**
 * User-visible segments in block order: `text` blocks, plus images from
 * successful image-tool results and videos from successful merge_videos results. thinking/reasoning, tool_use, non-image
 * tool results, citations and usage are never rendered here. URLs in
 * plain text stay text (never auto-linked or loaded as media), except that
 * generated-media and signed storage URLs are removed from assistant prose.
 */
function segments(message: MessageResponse): Segment[] {
  const toolUses = new Map<string, { toolName: string; status: string }>();
  for (const block of message.content) {
    if (block.type === "tool_use") toolUses.set(block.toolInvocationId, block);
  }

  const result: Segment[] = [];
  const isAssistant = message.role === "ASSISTANT";
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      // Assistant prose never shows media/signed URLs, context file lists or
      // its own credit statements: media and settled usage render from the
      // tool result instead.
      const text = isAssistant ? sanitizeAssistantText(block.text) : block.text;
      if (text.trim().length > 0) result.push({ kind: "text", key: `t${index}`, text });
      return;
    }
    if (block.type !== "tool_result" || block.error) return;
    const toolUse = toolUses.get(block.toolInvocationId);
    if (!toolUse || toolUse.status !== "COMPLETED") return;
    if (IMAGE_TOOLS.has(toolUse.toolName)) {
      const urls = mediaUrls(message, block.toolInvocationId, providerUrls(toolUse.toolName, block.output));
      if (urls.length > 0) result.push({ kind: "images", key: `i${index}`, urls, credits: block.creditsCharged });
    } else if (VIDEO_TOOLS.has(toolUse.toolName)) {
      const urls = mediaUrls(message, block.toolInvocationId, providerUrls(toolUse.toolName, block.output));
      if (urls.length > 0) result.push({ kind: "videos", key: `v${index}`, urls, credits: block.creditsCharged });
    }
  });
  return result;
}

/** Live view of the in-flight assistant message (transport only). */
export type LiveTurn = { text: LiveText | null };

function formatSeconds(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

/** Why a turn ended early, and what to do next — from the run's safe reason. */
/** The run's execution stopped unexpectedly (recovered by the server). */
const RUN_INTERRUPTED = "RUN_INTERRUPTED";

/** PENDING without an ended run's reason: the turn is genuinely still in progress. */
function isInProgress(message: MessageResponse): boolean {
  return message.status === "PENDING" && !message.error;
}

function endedReason(message: MessageResponse): string {
  const error = message.error;
  if (message.status === "FAILED") return error?.message || "Failed to generate a response.";
  if (!error || error.code === "CANCELLED_BY_USER") return "Stopped.";
  if (error.code === "INTERRUPTED_BY_USER") return "Interrupted.";
  return error.message || "Stopped."; // e.g. an expired approval: says how to continue
}

/**
 * Operation metadata, not prose: the credits charged to the user's balance
 * for a generated result — its tool result's settled `creditsCharged`
 * (filled from the ToolInvocation by the API when settlement finished after
 * the turn). "Charged", not "used": if the balance ran out, the charge can
 * be lower than the provider's reported usage (`creditsUsed`). One per tool
 * invocation, below its media. Null means not settled — nothing is shown
 * (never a zero, never an estimate). Exact value on hover.
 */
function CreditUsage({ credits }: { credits: number | null }) {
  if (credits === null) return null;
  return (
    <p data-credit-usage="" className="text-xs text-muted-foreground tabular-nums" title={`${exactCredits(credits)} charged`}>
      {formatCredits(credits)} credits charged
      {/* Abbreviated ("1.25M"): screen readers also get the exact amount. */}
      {credits >= 1_000_000 && <span className="sr-only"> ({exactCredits(credits)} charged)</span>}
    </p>
  );
}

function Segments({ parts }: { parts: Segment[] }) {
  return parts.map((part) =>
    part.kind === "text" ? (
      <div key={part.key} className="whitespace-pre-wrap">
        {part.text}
      </div>
    ) : part.kind === "videos" ? (
      <div key={part.key} className="flex flex-col gap-2">
        {part.urls.map((url, i) => (
          <GeneratedVideo
            key={`${url}-${i}`}
            src={url}
            label={part.urls.length > 1 ? `Generated video ${i + 1} of ${part.urls.length}` : "Generated video"}
          />
        ))}
        <CreditUsage credits={part.credits} />
      </div>
    ) : (
      <div key={part.key} className="flex flex-col gap-2">
        {part.urls.map((url, i) => (
          <GeneratedImage
            key={`${url}-${i}`}
            src={url}
            alt={part.urls.length > 1 ? `Generated image ${i + 1} of ${part.urls.length}` : "Generated image"}
          />
        ))}
        <CreditUsage credits={part.credits} />
      </div>
    ),
  );
}

/**
 * A pending turn shows streamed text when the stream has any for this
 * message (it carries every round so far), else whatever the server has
 * persisted (partial text is flushed while streaming); persisted images
 * follow. Once the message is terminal, only persisted state is shown.
 *
 * No status text here: the run's single status line (RunStatusIndicator)
 * says what is happening. An empty bubble shows a silent placeholder.
 */
function PendingBody({ message, parts, live }: { message: MessageResponse; parts: Segment[]; live?: LiveTurn }) {
  // Leading whitespace is trimmed, as it is in the persisted copy.
  const streamed =
    live?.text?.messageId === message.id
      ? live.text.rounds.map((t) => sanitizeAssistantText(t, { streaming: true }).trimStart()).filter((t) => t.length > 0)
      : [];
  const shown: Segment[] = streamed.length
    ? [
        ...streamed.map((text, i): Segment => ({ kind: "text", key: `s${i}`, text })),
        ...parts.filter((p) => p.kind !== "text"),
      ]
    : parts;
  if (shown.length > 0) return <Segments parts={shown} />;
  return (
    <span data-pending-placeholder="" aria-hidden="true" className="flex h-5 items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function MessageBubble({ message, live }: { message: MessageResponse; live?: LiveTurn }) {
  const isUser = message.role === "USER";
  const parts = segments(message);

  let body: React.ReactNode;
  if (message.error?.code === RUN_INTERRUPTED) {
    // Whatever was produced is kept, but it is never presented as a finished
    // answer, and an empty turn is an error state — not an endless "Thinking…".
    body = (
      <>
        {parts.length > 0 && <Segments parts={parts} />}
        <div role="status" className="flex flex-col gap-0.5 border-t border-destructive/30 pt-2">
          <span className="font-medium text-destructive">Response interrupted</span>
          <span className="text-muted-foreground">The execution stopped unexpectedly. Send a new message to continue.</span>
        </div>
      </>
    );
  } else if (isInProgress(message)) {
    body = <PendingBody message={message} parts={parts} live={live} />;
  } else if (message.status === "PENDING" || message.status === "FAILED" || message.status === "CANCELLED") {
    // FAILED/CANCELLED, or PENDING whose run has ended (e.g. an ambiguous
    // outcome): partial output (streamed text, tool results) is shown.
    // Partial output (streamed text, tool results) is preserved and shown.
    body = (
      <>
        {parts.length > 0 && <Segments parts={parts} />}
        <span className={cn(message.status === "CANCELLED" ? "text-muted-foreground italic" : "text-destructive")}>
          {endedReason(message)}
        </span>
      </>
    );
  } else if (parts.length === 0) {
    body = <span className="text-muted-foreground italic">(no text content)</span>;
  } else {
    body = <Segments parts={parts} />;
  }

  return (
    <div
      data-role={message.role}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[75%] min-w-0 flex-col gap-2 rounded-2xl px-3.5 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {/* Timing only — reasoning content is never shown. */}
        {!isUser && !isInProgress(message) && message.thinkingMs !== null && message.thinkingMs > 0 && (
          <span className="text-xs text-muted-foreground">Thought for {formatSeconds(message.thinkingMs)}</span>
        )}
        {/* Generated assets render inline from their tool result, not as chips. */}
        {/* A user message lists everything it sent (uploads and media-library picks, in order). */}
        <SentAttachments
          attachments={chipsOf(
            isUser ? (message.attachments ?? []) : (message.attachments ?? []).filter((a) => a.source === "UPLOAD"),
          )}
        />
        {body}
      </div>
    </div>
  );
}

/** A just-sent message awaiting admission (optimistic; see stores/pending-sends.ts). */
function PendingSendBubble({ send }: { send: PendingSend }) {
  return (
    <div data-role="USER" data-pending="true" className="flex w-full justify-end">
      <div className="flex max-w-[75%] min-w-0 flex-col gap-2 rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground opacity-80">
        <SentAttachments attachments={send.attachments} />
        <div className="whitespace-pre-wrap">{send.text}</div>
        <span className="text-xs opacity-80">Sending…</span>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  live,
  pending = [],
}: {
  messages: MessageResponse[];
  live?: LiveTurn;
  pending?: PendingSend[];
}) {
  return (
    <div className="flex flex-col gap-3 py-2" role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} live={isInProgress(message) ? live : undefined} />
      ))}
      {pending.map((send) => (
        <PendingSendBubble key={send.localId} send={send} />
      ))}
    </div>
  );
}
