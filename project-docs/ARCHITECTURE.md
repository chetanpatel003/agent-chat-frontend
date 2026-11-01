# ARCHITECTURE — frontend (implemented)

**Status: not yet implemented.**

## Planned shape (fill in as built)
- `src/lib/api/` — typed service modules wrapping backend calls, built on contracts synced from the backend repo (mechanism TBD — decided against openapi-fetch/openapi-typescript, see backend decisions; contracts folder sync script not yet written).
- TanStack Query for all server state.
- Zustand stores limited to ephemeral UI state (composer draft, sidebar collapse, etc.) — never ownership/credits/limits, which always come from the backend.
- `src/components/` — built from the reference product's repeated visual patterns (see backend decisions/0004 for functional-vs-visual-only scope).
