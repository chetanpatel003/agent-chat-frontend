# PROJECT_STATE — frontend

Full chronological narrative: `~/Desktop/chat/progress.md` (workspace-level, not currently git-tracked anywhere — flagged in backend's PROJECT_STATE.md).

## Day / hour
Day 1 of 3. Backend checkpoints 1.1 and 1.2 complete; this repo's checkpoint 1.2 piece (contract integration foundation) complete.

## Environment — verified
Clerk keys match backend's. `NEXT_PUBLIC_API_URL=http://localhost:3001` set.

## Implemented (checkpoint 1.2)
- `middleware.ts` — `clerkMiddleware()`, standard App Router matcher.
- `src/app/providers.tsx` — `ClerkProvider` + `QueryClientProvider`, wired into `src/app/layout.tsx`. Full query-key/retry conventions deferred to checkpoint 1.4.
- `scripts/sync-contracts.mjs` — copies the backend's `src/contracts/*` (sibling repo checkout) into `src/lib/api/contracts/`, rewriting the one Prisma-enum import. **Committed, not gitignored** — Vercel's build has no access to the sibling backend repo, so the synced output must ship with this repo; re-run manually and commit after a backend contract change.
- `src/lib/api/client.ts` — the one `fetch()` call site (`apiFetch`), Clerk-token header, Zod-validated error parsing.
- `src/lib/api/me.ts`, `src/hooks/use-me.ts` — demonstrates the full chain (Clerk token → typed client → Zod validation → TanStack Query) without building any chat UI, per checkpoint 1.2's explicit exclusion.
- No screens yet. No chat UI — excluded from this checkpoint.

## Next task if resuming cold
1. Read this file + MASTER.md.
2. Check backend repo's PROJECT_STATE.md for what contracts/routes actually exist before building anything new that depends on them.
3. `git status` + `git log --oneline` here.
4. If the backend's contracts changed since last sync: `pnpm sync:contracts` (requires the backend repo checked out as a sibling directory) and commit the result.
5. Wait for checkpoint 1.3 instructions before building chat UI.
