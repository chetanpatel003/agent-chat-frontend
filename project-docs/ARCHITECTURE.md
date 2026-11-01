# ARCHITECTURE — frontend (implemented)

## Implemented (checkpoint 1.2)
- `middleware.ts` + `src/app/providers.tsx` — Clerk + TanStack Query wiring at the root.
- `src/lib/api/contracts/` — synced from the backend, not hand-authored here (see API sync note in PROJECT_STATE.md). Import from `@/lib/api/contracts`, never redefine a shape the backend already owns.
- `src/lib/api/client.ts` — the one `fetch()` call site. Every typed service module (`src/lib/api/*.ts`) builds on `apiFetch()`; components never call `fetch` directly.
- `src/hooks/` — TanStack Query hooks wrapping the typed service modules; this is the only place components read server state.

## Planned shape (fill in as built)
- `src/components/` — built from the reference product's repeated visual patterns (see backend decisions/0004 for functional-vs-visual-only scope).
- Zustand stores limited to ephemeral UI state (composer draft, sidebar collapse, etc.) — never ownership/credits/limits, which always come from the backend.
