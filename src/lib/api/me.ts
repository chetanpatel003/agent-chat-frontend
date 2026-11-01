import { apiFetch } from "./client";
import {
  AuthenticatedUserResponseSchema,
  type AuthenticatedUserResponse,
} from "./contracts";

export async function getMe(token: string | null): Promise<AuthenticatedUserResponse> {
  const data = await apiFetch<unknown>("/api/v1/me", { token });
  // Validate at the trust boundary even though the backend already
  // validated on the way out — the frontend never assumes a response
  // shape it hasn't checked itself.
  return AuthenticatedUserResponseSchema.parse(data);
}
