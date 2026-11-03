"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { useChats, useCreateChat, useTogglePinChat, useDeleteChat } from "@/hooks/use-chats";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Pin, PinOff, Trash2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ChatResponse } from "@/lib/api/contracts";

function ChatRow({ chat, selected }: { chat: ChatResponse; selected: boolean }) {
  const togglePin = useTogglePinChat();
  const deleteChat = useDeleteChat();

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5",
        selected ? "bg-muted text-foreground" : "hover:bg-muted/60",
      )}
    >
      <Link
        href={`/chat/${chat.id}`}
        aria-current={selected ? "page" : undefined}
        className="flex-1 truncate text-sm"
      >
        {chat.title ?? "New chat"}
      </Link>
      <button
        type="button"
        aria-label={chat.isPinned ? "Unpin chat" : "Pin chat"}
        onClick={() => togglePin.mutate({ chatId: chat.id, isPinned: !chat.isPinned })}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        disabled={togglePin.isPending}
      >
        {chat.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={() => {
          if (window.confirm("Delete this chat? This cannot be undone.")) {
            deleteChat.mutate(chat.id);
          }
        }}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        disabled={deleteChat.isPending}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function ChatSidebar({ selectedChatId }: { selectedChatId: string | undefined }) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // Debounced: one request per pause in typing, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);
  const { data, isLoading, isError } = useChats({ q: search || undefined });
  const createChat = useCreateChat();

  const chats = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <nav aria-label="Chats" className="flex h-full flex-col gap-2 p-3">
      <Button
        variant="outline"
        className="justify-start gap-2"
        disabled={createChat.isPending || isSignedIn !== true}
        onClick={() =>
          createChat.mutate(
            {},
            { onSuccess: (chat) => router.push(`/chat/${chat.id}`) },
          )
        }
      >
        <Plus className="size-4" />
        New chat
      </Button>

      {isSignedIn === true && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          maxLength={200}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 pr-2">
          {isSignedIn !== true ? (
            <div className="flex flex-col items-start gap-2 px-2 py-4">
              <p className="text-sm text-muted-foreground">Sign in to view your chats.</p>
              {/* Clerk's own hosted sign-in UI — not a custom-built
                  screen; the only entry point to establish a session
                  anywhere in this app, found missing during 3.4.1
                  verification. */}
              <SignInButton mode="modal">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </SignInButton>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col gap-2 px-2 py-1">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : isError ? (
            <p className="px-2 py-4 text-sm text-destructive">Could not load chats.</p>
          ) : chats.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              {search ? `No chats match "${search}".` : "No chats yet — start one above."}
            </p>
          ) : (
            chats.map((chat) => (
              <ChatRow key={chat.id} chat={chat} selected={chat.id === selectedChatId} />
            ))
          )}
        </div>
      </ScrollArea>
    </nav>
  );
}
