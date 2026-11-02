"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMessages, sendMessage } from "@/lib/api/messages";
import type { SendMessageRequest } from "@/lib/api/contracts";

/**
 * Loads a chat's most recent messages first, then older pages on demand.
 * `getNextPageParam` reads `olderCursor`, not a generic `nextCursor` —
 * getting this wrong (e.g. copy-pasting the chats-list hook's
 * `lastPage.nextCursor`) would silently never paginate, since
 * PaginatedMessageResponse has no such field; the type system catches
 * that mismatch at compile time, not just by convention.
 */
export function useMessages(chatId: string | undefined, opts: { limit?: number } = {}) {
  const { getToken, isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: async ({ pageParam }) =>
      listMessages(await getToken(), chatId as string, {
        cursor: pageParam,
        limit: opts.limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.olderCursor ?? undefined,
    enabled: isSignedIn === true && !!chatId,
  });
}

/**
 * Admits a message via the real backend endpoint. The idempotency key
 * is the caller's to manage (generate fresh per intentional send, reuse
 * on a retry of the same send) — this hook only forwards it, exactly
 * like every other mutation hook here forwards its own request shape
 * without re-deriving business rules the backend already owns.
 *
 * On success: invalidates this chat's messages (the admitted user
 * message, and whatever the run has produced so far, become visible on
 * the next fetch) and the chats list (lastMessageAt changed, which can
 * affect sort order) — no realtime/polling is added here, out of scope
 * for this checkpoint.
 */
export function useSendMessage(chatId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      idempotencyKey,
      body,
    }: {
      idempotencyKey: string;
      body: SendMessageRequest;
    }) => sendMessage(await getToken(), chatId as string, idempotencyKey, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
