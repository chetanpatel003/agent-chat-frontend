"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { listChats, getChat, createChat, updateChat, deleteChat } from "@/lib/api/chats";
import type {
  ChatListResponse,
  ChatResponse,
  CreateChatRequest,
} from "@/lib/api/contracts";

const chatsKey = (q?: string) => ["chats", q ?? null] as const;
const chatKey = (chatId: string) => ["chat", chatId] as const;

export function useChats(opts: { q?: string; limit?: number } = {}) {
  const { getToken, isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: chatsKey(opts.q),
    queryFn: async ({ pageParam }) =>
      listChats(await getToken(), { cursor: pageParam, limit: opts.limit, q: opts.q }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isSignedIn === true,
  });
}

export function useChat(chatId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: chatKey(chatId ?? ""),
    queryFn: async () => getChat(await getToken(), chatId as string),
    enabled: isSignedIn === true && !!chatId,
  });
}

function patchChatInListCaches(queryClient: QueryClient, updated: ChatResponse) {
  queryClient.setQueriesData<InfiniteData<ChatListResponse>>({ queryKey: ["chats"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((c) => (c.id === updated.id ? updated : c)),
      })),
    };
  });
}

function removeChatFromListCaches(queryClient: QueryClient, chatId: string) {
  queryClient.setQueriesData<InfiniteData<ChatListResponse>>({ queryKey: ["chats"] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((c) => c.id !== chatId),
      })),
    };
  });
}

export function useCreateChat() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateChatRequest) => createChat(await getToken(), body),
    onSuccess: () => {
      // A new chat's position depends on existing pinned chats — simplest
      // correct behavior is letting the server determine it, rather than
      // guessing where to splice it into a cursor-paginated cache.
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useUpdateChatTitle() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, title }: { chatId: string; title: string }) =>
      updateChat(await getToken(), chatId, { title }),
    onSuccess: (updated) => {
      // Title doesn't affect sort order, so both caches are patched
      // directly — no network round trip needed to stay correct.
      queryClient.setQueryData(chatKey(updated.id), updated);
      patchChatInListCaches(queryClient, updated);
    },
  });
}

export function useTogglePinChat() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, isPinned }: { chatId: string; isPinned: boolean }) =>
      updateChat(await getToken(), chatId, { isPinned }),
    onSuccess: (updated) => {
      queryClient.setQueryData(chatKey(updated.id), updated);
      // Pin state changes sort order (pinned-first is a backend-owned
      // ordering rule, not something the frontend re-derives) — list
      // caches are invalidated rather than patched in place.
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

export function useDeleteChat() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => deleteChat(await getToken(), chatId),
    onSuccess: ({ id }) => {
      queryClient.removeQueries({ queryKey: chatKey(id) });
      removeChatFromListCaches(queryClient, id);
    },
  });
}
