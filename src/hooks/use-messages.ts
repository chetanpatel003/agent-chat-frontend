"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listMessages } from "@/lib/api/messages";

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
