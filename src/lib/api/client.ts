import { ErrorResponseSchema } from "./contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Clerk session token. Callers get this from useAuth().getToken() —
   * this module never imports a Clerk hook itself, so it stays usable
   * from both client and server call sites. */
  token: string | null;
  /** Extra headers beyond Authorization/Content-Type — e.g. the
   * required Idempotency-Key on message admission. */
  headers?: Record<string, string>;
};

/**
 * The one place a raw fetch() to the backend happens. Every typed service
 * module (src/lib/api/*.ts) builds on this instead of calling fetch
 * directly from a component — see frontend rules: "Never scatter raw
 * first-party fetch calls through components."
 */
export async function apiFetch<T>(
  path: string,
  { method = "GET", body, token, headers }: ApiFetchOptions,
): Promise<T> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  if (!token) {
    throw new ApiError("Not signed in", "UnauthorizedError", 401);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();

  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.message,
        parsed.data.error.code,
        response.status,
      );
    }
    throw new ApiError("Request failed", "UnknownError", response.status);
  }

  return json.data as T;
}

/** Builds a query string from a plain object, dropping undefined/empty
 * values so an omitted optional param is genuinely absent from the URL
 * rather than sent as the literal string "undefined". */
export function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
