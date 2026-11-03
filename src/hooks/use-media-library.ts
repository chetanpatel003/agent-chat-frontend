"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listMediaLibrary } from "@/lib/api/attachments";

export const MEDIA_LIBRARY_KEY = ["media-library"] as const;
const PAGE_SIZE = 24;

/** The user's media library, fetched only while the picker is open. */
export function useMediaLibrary(enabled: boolean) {
  const { getToken, isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: MEDIA_LIBRARY_KEY,
    queryFn: async ({ pageParam }) => listMediaLibrary(await getToken(), { cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && isSignedIn === true,
  });
}
