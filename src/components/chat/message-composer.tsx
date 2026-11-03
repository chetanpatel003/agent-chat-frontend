"use client";

import { useRef, useState } from "react";
import { Images, ListChecks, Paperclip } from "lucide-react";
import { useSendMessage } from "@/hooks/use-messages";
import { useComposerAttachments } from "@/hooks/use-composer-attachments";
import { MAX_ATTACHMENTS_PER_MESSAGE, UPLOAD_MIME_TYPES } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ComposerAttachments } from "./composer-attachments";
import { MediaPicker } from "./media-picker";

/** An actionable reason for a failed admission (the draft is restored either way). */
function sendFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "A response is already in progress. Wait for it, or stop it, then retry.";
    if (error.status === 503) return "The service is busy. Your message was not sent — retry in a moment.";
    if (error.status === 401) return "Your session expired. Sign in again, then retry.";
  }
  return "Could not send that message. Your draft is restored.";
}

/**
 * Idempotency-key lifecycle: a fresh key is generated for each
 * intentional send (new or changed text). A failed send keeps its key
 * attached to the exact text it was generated for — clicking "Retry"
 * without editing the text reuses that same key (Phase 3.4.1 §3.C);
 * editing the text first is a new intentional send and gets a new key
 * on the next submit.
 */
export function MessageComposer({
  chatId,
  disabled,
  activeRunId,
}: {
  chatId: string;
  disabled?: boolean;
  /** While a run is active, sending interrupts it (the server cancels it
   * atomically with admitting this message). */
  activeRunId?: string | null;
}) {
  const [text, setText] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sendMessage = useSendMessage(chatId);
  const attachments = useComposerAttachments(chatId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const keyForTextRef = useRef<string | null>(null);

  // Keyed on text *and* attachments: changing either is a new send.
  function keyFor(signature: string): string {
    if (idempotencyKeyRef.current && keyForTextRef.current === signature) {
      return idempotencyKeyRef.current;
    }
    const key = crypto.randomUUID();
    idempotencyKeyRef.current = key;
    keyForTextRef.current = signature;
    return key;
  }

  const canSend = !!text.trim() && !attachments.blockedReason;

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || attachments.blockedReason || sendMessage.isPending) return;
    const attachmentIds = attachments.readyIds;
    const draft = text;

    const interruptRunId = activeRunId ?? undefined;
    // Optimistic: the message shows in the conversation at once and the
    // composer clears now (the attachment tray is hidden while pending).
    // A failed admission restores the draft exactly, so Retry resends the
    // same text and attachments under the same Idempotency-Key.
    setText("");
    sendMessage.mutate(
      {
        // Keyed on everything that makes it a different send.
        idempotencyKey: keyFor([trimmed, attachmentIds.join(","), planMode, interruptRunId ?? ""].join("\u0000")),
        body: { text: trimmed, attachmentIds, planMode, ...(interruptRunId ? { interruptRunId } : {}) },
        preview: {
          attachments: attachments.items.flatMap((i) =>
            i.status === "ready" && i.attachmentId ? [{ id: i.attachmentId, name: i.name, kind: i.kind }] : [],
          ),
        },
      },
      {
        onSuccess: () => {
          attachments.clear();
          idempotencyKeyRef.current = null;
          keyForTextRef.current = null;
        },
        onError: () => setText((current) => (current === "" ? draft : current)),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-background p-3">
      <ComposerAttachments
        items={sendMessage.isPending ? [] : attachments.items}
        onCancel={attachments.cancel}
        onRetry={attachments.retry}
        onRemove={attachments.remove}
      />
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={UPLOAD_MIME_TYPES.join(",")}
          className="hidden"
          aria-label="Attach files"
          onChange={(e) => {
            attachments.addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Attach images or videos"
          disabled={disabled || sendMessage.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Choose from media library"
          aria-haspopup="dialog"
          disabled={disabled || sendMessage.isPending}
          onClick={() => setPickerOpen(true)}
        >
          <Images className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={planMode ? "secondary" : "ghost"}
          size="icon"
          aria-label="Plan mode"
          aria-pressed={planMode}
          title={planMode ? "Plan mode on: the agent proposes a plan for your approval first" : "Plan mode"}
          disabled={disabled || sendMessage.isPending}
          onClick={() => setPlanMode((on) => !on)}
        >
          <ListChecks className="size-4" aria-hidden="true" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          aria-label="Message"
          disabled={disabled || sendMessage.isPending}
          className="max-h-40 resize-none"
        />
        <Button
          onClick={submit}
          disabled={disabled || sendMessage.isPending || !canSend}
          aria-label={activeRunId ? "Interrupt and send" : "Send"}
        >
          {activeRunId ? "Interrupt" : "Send"}
        </Button>
      </div>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        addedIds={new Set(attachments.items.flatMap((i) => (i.attachmentId ? [i.attachmentId] : [])))}
        remaining={Math.max(
          0,
          MAX_ATTACHMENTS_PER_MESSAGE - attachments.items.filter((i) => i.status !== "rejected").length,
        )}
        onAdd={attachments.addFromLibrary}
      />
      {attachments.blockedReason && text.trim() && (
        <p className="mt-2 text-xs text-muted-foreground">{attachments.blockedReason}</p>
      )}
      {sendMessage.isError && (
        <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-destructive">
          <span>{sendFailureMessage(sendMessage.error)}</span>
          <button type="button" className="underline" onClick={submit}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
