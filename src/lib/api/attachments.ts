import { apiFetch, toQueryString } from "./client";
import {
  AttachmentResponseSchema,
  MediaLibraryPageSchema,
  type MediaLibraryPage,
  UploadAuthorizationResponseSchema,
  type AttachmentResponse,
  type CreateAttachmentRequest,
  type UploadAuthorizationResponse,
} from "./contracts";

export async function createAttachment(
  token: string | null,
  body: CreateAttachmentRequest,
): Promise<AttachmentResponse> {
  const data = await apiFetch<unknown>("/api/v1/attachments", { method: "POST", body, token });
  return AttachmentResponseSchema.parse(data);
}

export async function authorizeAttachmentUpload(
  token: string | null,
  attachmentId: string,
): Promise<UploadAuthorizationResponse> {
  const data = await apiFetch<unknown>(`/api/v1/attachments/${attachmentId}/upload-authorization`, {
    method: "POST",
    token,
  });
  return UploadAuthorizationResponseSchema.parse(data);
}

export async function completeAttachmentUpload(
  token: string | null,
  attachmentId: string,
  assemblyId: string,
): Promise<AttachmentResponse> {
  const data = await apiFetch<unknown>(`/api/v1/attachments/${attachmentId}/complete`, {
    method: "POST",
    body: { assemblyId },
    token,
  });
  return AttachmentResponseSchema.parse(data);
}

export async function cancelAttachmentUpload(
  token: string | null,
  attachmentId: string,
): Promise<AttachmentResponse> {
  const data = await apiFetch<unknown>(`/api/v1/attachments/${attachmentId}/cancel`, {
    method: "POST",
    token,
  });
  return AttachmentResponseSchema.parse(data);
}

/** The caller's media library (sent uploads and generated outputs), newest first. */
export async function listMediaLibrary(
  token: string | null,
  params: { cursor?: string; limit?: number } = {},
): Promise<MediaLibraryPage> {
  const data = await apiFetch<unknown>(`/api/v1/attachments/library${toQueryString(params)}`, { token });
  return MediaLibraryPageSchema.parse(data);
}
