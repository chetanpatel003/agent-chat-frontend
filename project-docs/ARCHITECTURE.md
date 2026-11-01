# ARCHITECTURE — frontend (implemented)

## Implemented (checkpoint 1.2)
- `middleware.ts` + `src/app/providers.tsx` — Clerk + TanStack Query wiring at the root.
- `src/lib/api/contracts/` — synced from the backend, not hand-authored here (see API sync note in PROJECT_STATE.md). Import from `@/lib/api/contracts`, never redefine a shape the backend already owns.
- `src/lib/api/client.ts` — the one `fetch()` call site. Every typed service module (`src/lib/api/*.ts`) builds on `apiFetch()`; components never call `fetch` directly.
- `src/hooks/` — TanStack Query hooks wrapping the typed service modules; this is the only place components read server state.

## Implemented (checkpoint 1.4)
- `src/lib/api/chats.ts`, `messages.ts`, `credits.ts` — the full typed service layer for the APIs checkpoint 1.3 added. `client.ts` gained `toQueryString()`, shared by every list/search call.
- `src/hooks/use-chats.ts`, `use-messages.ts`, `use-credits.ts` — query hooks (`useChats`, `useChat`, `useMessages`, `useCreditBalance`, `useCreditLedger`) and mutation hooks (`useCreateChat`, `useUpdateChatTitle`, `useTogglePinChat`, `useDeleteChat`) with a deliberate per-mutation cache strategy — see API_CONTRACTS.md.
- `src/app/providers.tsx` — `QueryClient` now has a shared `retry` policy: never retry a 401/403.
- `src/test-utils/query-wrapper.tsx` — shared `QueryClientProvider` wrapper + a retry-disabled test `QueryClient`, used by every hook test.
- Still no `src/components/` or chat UI — out of scope through checkpoint 1.4.

## Planned shape (fill in as built)
- `src/components/` — built from the reference product's repeated visual patterns (see backend decisions/0004 for functional-vs-visual-only scope).
- Zustand stores limited to ephemeral UI state (composer draft, sidebar collapse, etc.) — never ownership/credits/limits, which always come from the backend.

## Testing note (checkpoint 1.4)
Hook tests (`*.test.tsx`) run under `// @vitest-environment jsdom` (opted
in per file — plain service/contract tests stay on the faster `node`
environment) and need `@vitejs/plugin-react` registered in
`vitest.config.mts` (added this checkpoint) for JSX in test files to
transform. They use `@testing-library/react`'s `renderHook` + MSW against
the real service modules — this exercises the actual integration chain
(hook → service → `apiFetch` → MSW-intercepted HTTP → Zod validation →
TanStack Query cache), not a shallow mock of the service layer.

**Known environment quirk, worked around, not silently hidden:** in this
exact React 19 + RTL 16.3.3 + jsdom 30 combination, a `renderHook()`
result's `result.current` does not always reflect a cache update that
happened via a *different* `renderHook()` instance (or even the same
instance's own `fetchNextPage()`) immediately after an `act()` block
resolves — confirmed via direct `queryClient.getQueryCache()` inspection
that the cache itself updates correctly every time; only the test's own
snapshot read lagged. Calling RTL's own `rerender()` before the
assertion reliably fixes it and is used wherever this came up. Flagged
here in case it resurfaces in future hook tests.
