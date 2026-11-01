import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { apiFetch, ApiError, toQueryString } from "./client";

const API_BASE_URL = "http://localhost:3001";
process.env.NEXT_PUBLIC_API_URL = API_BASE_URL;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("apiFetch", () => {
  it("attaches the bearer token and parses a successful response's data", async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/me`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true, data: { hello: "world" } });
      }),
    );

    const result = await apiFetch<{ hello: string }>("/api/v1/me", {
      token: "a-real-token",
    });

    expect(capturedAuth).toBe("Bearer a-real-token");
    expect(result).toEqual({ hello: "world" });
  });

  it("throws ApiError with the backend's code/message/status on a non-2xx response", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/me`, () =>
        HttpResponse.json(
          { ok: false, error: { code: "NotFoundError", message: "Chat not found" } },
          { status: 404 },
        ),
      ),
    );

    await expect(
      apiFetch("/api/v1/me", { token: "a-real-token" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "NotFoundError",
      status: 404,
      message: "Chat not found",
    });
  });

  it("refuses to call the backend at all without a token — never sends an unauthenticated request", async () => {
    let requestWasMade = false;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/me`, () => {
        requestWasMade = true;
        return HttpResponse.json({ ok: true, data: {} });
      }),
    );

    await expect(apiFetch("/api/v1/me", { token: null })).rejects.toThrow(ApiError);
    expect(requestWasMade).toBe(false);
  });

  it("surfaces an invalid/expired token as a 401 UnauthorizedError, distinct from a missing token", async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/me`, () =>
        HttpResponse.json(
          { ok: false, error: { code: "UnauthorizedError", message: "Authentication required" } },
          { status: 401 },
        ),
      ),
    );

    // Unlike the "no token at all" case above, this one DOES reach the
    // network — the token looked present to the client, only the backend
    // rejected it (expired, revoked, tampered).
    await expect(
      apiFetch("/api/v1/me", { token: "a-stale-token" }),
    ).rejects.toMatchObject({ name: "ApiError", code: "UnauthorizedError", status: 401 });
  });
});

describe("toQueryString", () => {
  it("omits undefined and empty-string values", () => {
    expect(toQueryString({ cursor: undefined, limit: 20, q: "" })).toBe("?limit=20");
  });

  it("returns an empty string when nothing is set", () => {
    expect(toQueryString({ cursor: undefined, q: undefined })).toBe("");
  });

  it("includes every provided value", () => {
    const qs = toQueryString({ cursor: "abc", limit: 10, q: "search term" });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("cursor")).toBe("abc");
    expect(params.get("limit")).toBe("10");
    expect(params.get("q")).toBe("search term");
  });
});
