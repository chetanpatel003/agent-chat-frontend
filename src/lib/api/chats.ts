import { z } from "zod";
import { apiFetch, toQueryString } from "./client";
import {
  ChatListResponseSchema,
  ChatResponseSchema,
  type ChatListResponse,
  type ChatResponse,
  type CreateChatRequest,
  type UpdateChatRequest,
} from "./contracts";

// The backend's delete response is a bare { id } with no named contract
// (see backend decisions) — validated inline here rather than trusted
// unchecked, for the same reason every other response is.
const DeleteChatResponseSchema = z.object({ id: z.uuid() });

export async function listChats(
  token: string | null,
  params: { cursor?: string; limit?: number; q?: string } = {},
): Promise<ChatListResponse> {
  const qs = toQueryString(params);
  const data = await apiFetch<unknown>(`/api/v1/chats${qs}`, { token });
  return ChatListResponseSchema.parse(data);
}

export async function getChat(token: string | null, chatId: string): Promise<ChatResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}`, { token });
  return ChatResponseSchema.parse(data);
}

export async function createChat(
  token: string | null,
  body: CreateChatRequest,
): Promise<ChatResponse> {
  // CreateChatRequestSchema isn't re-validated here — Zod business rules
  // (min/max title length) live once, on the backend; this module trusts
  // the caller passed a CreateChatRequest-typed value and validates only
  // the response, which the frontend has to check regardless of what the
  // backend already validated on the way out.
  const data = await apiFetch<unknown>("/api/v1/chats", { method: "POST", body, token });
  return ChatResponseSchema.parse(data);
}

export async function updateChat(
  token: string | null,
  chatId: string,
  body: UpdateChatRequest,
): Promise<ChatResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}`, {
    method: "PATCH",
    body,
    token,
  });
  return ChatResponseSchema.parse(data);
}

export async function deleteChat(
  token: string | null,
  chatId: string,
): Promise<{ id: string }> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}`, {
    method: "DELETE",
    token,
  });
  return DeleteChatResponseSchema.parse(data);
}
