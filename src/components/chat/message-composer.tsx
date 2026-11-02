"use client";

import { useRef, useState } from "react";
import { useSendMessage } from "@/hooks/use-messages";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
}: {
  chatId: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const sendMessage = useSendMessage(chatId);
  const idempotencyKeyRef = useRef<string | null>(null);
  const keyForTextRef = useRef<string | null>(null);

  function keyFor(currentText: string): string {
    if (idempotencyKeyRef.current && keyForTextRef.current === currentText) {
      return idempotencyKeyRef.current;
    }
    const key = crypto.randomUUID();
    idempotencyKeyRef.current = key;
    keyForTextRef.current = currentText;
    return key;
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sendMessage.isPending) return;

    sendMessage.mutate(
      { idempotencyKey: keyFor(trimmed), body: { text: trimmed } },
      {
        onSuccess: () => {
          setText("");
          idempotencyKeyRef.current = null;
          keyForTextRef.current = null;
        },
        // On failure the key/text stay attached (see keyFor) so a
        // Retry click reuses the same Idempotency-Key automatically.
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
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          aria-label="Message"
          disabled={disabled || sendMessage.isPending}
          className="max-h-40 resize-none"
        />
        <Button onClick={submit} disabled={disabled || sendMessage.isPending || !text.trim()}>
          Send
        </Button>
      </div>
      {sendMessage.isError && (
        <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
          <span>Could not send that message.</span>
          <button type="button" className="underline" onClick={submit}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
