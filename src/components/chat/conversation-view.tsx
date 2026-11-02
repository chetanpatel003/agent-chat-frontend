"use client";

import { useAuth } from "@clerk/nextjs";
import { useMessages } from "@/hooks/use-messages";
import { MessageList } from "./message-list";
import { MessageComposer } from "./message-composer";
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

  // Pages arrive newest-first (first page = most recent); each page's
  // own items are already chronological (oldest-first within it). To
  // render the whole loaded history oldest-to-newest top-to-bottom,
  // reverse the page order before flattening.
  const messages = data ? [...data.pages].reverse().flatMap((page) => page.items) : [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-4">
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
          ) : messages.length === 0 ? (
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
              <MessageList messages={messages} />
            </>
          )}
        </div>
      </ScrollArea>
      <MessageComposer chatId={chatId} disabled={isSignedIn !== true} />
    </div>
  );
}
