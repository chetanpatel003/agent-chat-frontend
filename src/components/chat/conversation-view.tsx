"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { usePendingSends, visiblePendingSends } from "@/stores/pending-sends";
import { useMessages } from "@/hooks/use-messages";
import { useRunActivity } from "@/hooks/use-run-activity";
import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
import { RunStatusIndicatorView } from "./run-status-indicator";
import { WaitpointCard } from "./waitpoint-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ConversationView({ chatId }: { chatId: string | undefined }) {
  const { isSignedIn } = useAuth();
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMessages(chatId);
  // The one realtime subscription for this chat's active run (metadata
  // events + the assistant-text stream), shared by the streaming bubble,
  // the status bar, the approval card and the composer's interrupt state.
  const activity = useRunActivity(chatId);

  // Pages arrive newest-first (first page = most recent); each page's
  // own items are already chronological (oldest-first within it). To
  // render the whole loaded history oldest-to-newest top-to-bottom,
  // reverse the page order before flattening.
  const messages = useMemo(() => (data ? [...data.pages].reverse().flatMap((page) => page.items) : []), [data]);
  const allSends = usePendingSends((s) => s.sends);
  const pending = useMemo(
    () => (chatId ? visiblePendingSends(allSends, chatId, new Set(messages.map((m) => m.id))) : []),
    [allSends, chatId, messages],
  );

  const last = messages.at(-1);
  const liveLength = activity.liveText?.rounds.reduce((n, t) => n + t.length, 0) ?? 0;
  const { viewportRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>({
    // Anything that adds visible content at the bottom.
    followKey: `${messages.length}:${last?.id}:${last?.status}:${last?.content.length}:${liveLength}:${pending.length}`,
    // A new send always scrolls to it.
    forceKey: pending.at(-1)?.localId,
  });

  if (!chatId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a chat or start a new one.
      </div>
    );
  }

  if (isSignedIn !== true) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Sign in to view this chat.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <div ref={contentRef} className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-4">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-2/3 self-end" />
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5 self-end" />
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load this conversation.
            </p>
          ) : messages.length === 0 && pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet — say something below.
            </p>
          ) : (
            <>
              {hasNextPage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mx-auto"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? "Loading…" : "Load older messages"}
                </Button>
              )}
              <MessageList messages={messages} live={{ text: activity.liveText }} pending={pending} />
            </>
          )}
        </div>
      </ScrollArea>
      <WaitpointCard chatId={chatId} activity={activity} />
      <RunStatusIndicatorView chatId={chatId} activity={activity} />
      <MessageComposer chatId={chatId} disabled={isSignedIn !== true} activeRunId={activity.activeRun?.id ?? null} />
    </div>
  );
}
