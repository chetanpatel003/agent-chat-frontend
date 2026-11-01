# PROJECT_STATE — frontend

Full chronological narrative: `~/Desktop/chat/progress.md` (workspace-level, not currently git-tracked anywhere — flagged in backend's PROJECT_STATE.md).

## Day / hour
Day 1 of 3. **Phase 1 complete** — all 4 checkpoints done in both repos.

## Environment — verified
Clerk keys match backend's. `NEXT_PUBLIC_API_URL=http://localhost:3001` set.

## Implemented (checkpoint 1.2)
- `middleware.ts` — `clerkMiddleware()`, standard App Router matcher.
- `src/app/providers.tsx` — `ClerkProvider` + `QueryClientProvider`, wired into `src/app/layout.tsx`.
- `scripts/sync-contracts.mjs` — copies the backend's `src/contracts/*` (sibling repo checkout) into `src/lib/api/contracts/`. **Committed, not gitignored** — Vercel's build has no access to the sibling backend repo.
- `src/lib/api/client.ts` — the one `fetch()` call site (`apiFetch`), Clerk-token header, Zod-validated error parsing.
- `src/lib/api/me.ts`, `src/hooks/use-me.ts`.

## Checkpoint 1.3
Contract re-sync only (backend's cursor field rename + new schemas) — no new frontend code, confirmed clean.

## Implemented (checkpoint 1.4) — frontend integration complete
- **Service modules:** `src/lib/api/chats.ts`, `messages.ts`, `credits.ts` — full typed coverage of every checkpoint 1.3 endpoint.
- **Query hooks:** `useChats` (list + search, infinite), `useChat`, `useMessages` (infinite, `olderCursor`-driven), `useCreditBalance`, `useCreditLedger` (infinite).
- **Mutation hooks:** `useCreateChat`, `useUpdateChatTitle`, `useTogglePinChat`, `useDeleteChat` — each with a deliberately chosen cache strategy (patch-in-place vs. invalidate, depending on whether the change affects list order). See API_CONTRACTS.md.
- **Retry policy:** `providers.tsx`'s `QueryClient` never retries a 401/403.
- **Testing infra added:** `@vitejs/plugin-react` registered in `vitest.config.mts`; `src/test-utils/query-wrapper.tsx`; per-file `// @vitest-environment jsdom` opt-in for hook tests.
- 19 new tests (22 total, up from 3). `pnpm build` (production) verified passing.
- Still no `src/components/` or chat UI — explicitly out of scope through this checkpoint.

## Next task if resuming cold
1. Read this file + MASTER.md + API_CONTRACTS.md + ARCHITECTURE.md (testing-note section — a known RTL/React-19 quirk and its fix, relevant to any new hook test).
2. Check backend repo's PROJECT_STATE.md for what's actually implemented before building UI on top of it.
3. `git status` + `git log --oneline` here. Checkpoint 1.4's changes are staged, not committed, same pattern as every prior checkpoint.
4. `pnpm test` to re-confirm 22/22 still pass.
5. **Phase 1 is done** — the next work is chat workspace UI and/or Phase 2 (agent execution), per whatever the user specifies next.
