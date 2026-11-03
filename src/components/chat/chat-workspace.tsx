"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ChatSidebar } from "./chat-sidebar";
import { ConversationView } from "./conversation-view";
import { CreditBalance } from "./credit-balance";

/**
 * The chat workspace shell: a persistent sidebar (chat navigation) and
 * the conversation area for whichever chat is selected — `selectedChatId`
 * comes from the route (`/` = none selected, `/chat/[chatId]` = that
 * chat), never from component-local state, so a page refresh restores
 * the same selection and its persisted messages.
 */
export function ChatWorkspace({ selectedChatId }: { selectedChatId: string | undefined }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 w-full">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <ChatSidebar selectedChatId={selectedChatId} />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-4">
          <div className="md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open chat list">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-3/4 p-0 sm:max-w-xs">
              <SheetTitle className="sr-only">Chats</SheetTitle>
              {/* Close only when a chat is opened (a link is followed) — not on
                  search typing, pin or delete inside the list. */}
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setMobileNavOpen(false);
                }}
                className="h-full"
              >
                <ChatSidebar selectedChatId={selectedChatId} />
              </div>
            </SheetContent>
          </Sheet>
          </div>
          <span className="text-sm font-medium">Agent Chat</span>
          <CreditBalance className="ml-auto" />
        </header>

        {/* Remounting per chat keeps per-chat composer/draft state from
            leaking across a chat switch — see conversation-view.tsx. */}
        <ConversationView key={selectedChatId ?? "none"} chatId={selectedChatId} />
      </div>
    </div>
  );
}
