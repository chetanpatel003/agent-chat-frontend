import { apiFetch } from "./client";
import {
  AgentRunResponseSchema,
  RealtimeTokenResponseSchema,
  WaitpointListResponseSchema,
  WaitpointResponseSchema,
  type AgentRunResponse,
  type PlanResolution,
  type RealtimeTokenResponse,
  type WaitpointListResponse,
  type WaitpointResponse,
} from "./contracts";

export async function getActiveRun(
  token: string | null,
  chatId: string,
): Promise<AgentRunResponse | null> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/runs/active`, { token });
  return data === null ? null : AgentRunResponseSchema.parse(data);
}

export async function getRealtimeToken(
  token: string | null,
  chatId: string,
  runId: string,
): Promise<RealtimeTokenResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/runs/${runId}/realtime-token`, {
    token,
  });
  return RealtimeTokenResponseSchema.parse(data);
}

export async function cancelRun(
  token: string | null,
  chatId: string,
  runId: string,
): Promise<AgentRunResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/runs/${runId}/cancel`, {
    method: "POST",
    token,
  });
  return AgentRunResponseSchema.parse(data);
}

export async function listWaitpoints(
  token: string | null,
  chatId: string,
  runId: string,
): Promise<WaitpointListResponse> {
  const data = await apiFetch<unknown>(`/api/v1/chats/${chatId}/runs/${runId}/waitpoints`, { token });
  return WaitpointListResponseSchema.parse(data);
}

/** Idempotent server-side: the first decision wins; repeating it re-ensures the run resumes. */
export async function resolveWaitpoint(
  token: string | null,
  chatId: string,
  runId: string,
  waitpointId: string,
  body: PlanResolution,
): Promise<WaitpointResponse> {
  const data = await apiFetch<unknown>(
    `/api/v1/chats/${chatId}/runs/${runId}/waitpoints/${waitpointId}/resolve`,
    { method: "POST", body, token },
  );
  return WaitpointResponseSchema.parse(data);
}
