import { apiFetch, toQueryString } from "./client";
import {
  PaginatedMessageResponseSchema,
  type PaginatedMessageResponse,
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
