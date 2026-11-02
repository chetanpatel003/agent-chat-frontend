import { apiFetch, toQueryString } from "./client";
import {
  PaginatedMessageResponseSchema,
  SendMessageResponseSchema,
  type PaginatedMessageResponse,
  type SendMessageRequest,
  type SendMessageResponse,
} from "./contracts";

export async function listMessages(
  token: string | null,
  chatId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<PaginatedMessageResponse> {
  const qs = toQueryString(params);
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/messages${qs}`, {
    token,
  });
  return PaginatedMessageResponseSchema.parse(data);
}

/**
 * Admits a new message. `idempotencyKey` is the caller's responsibility
 * to generate once per intentional send and reuse across a retry of
 * that same send (see use-messages.ts#useSendMessage) — this module
 * just forwards it as the header the backend requires.
 */
export async function sendMessage(
  token: string | null,
  chatId: string,
  idempotencyKey: string,
  body: SendMessageRequest,
): Promise<SendMessageResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/messages`, {
    method: "POST",
    body,
    token,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return SendMessageResponseSchema.parse(data);
}
