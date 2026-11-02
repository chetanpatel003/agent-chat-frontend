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

## Implemented (checkpoint 3.4.1) — core chat workspace
- **Contract re-sync**: `pnpm sync:contracts` run — fixed the drift an earlier audit found (`SendMessageRequestSchema`/`SendMessageResponseSchema` were missing; `agent-run.ts` also picked up changes). No contract is hand-duplicated anywhere in this repo.
- **`src/lib/api/client.ts`**: `apiFetch` gained an optional `headers` passthrough (needed for the required `Idempotency-Key` header — the only new capability added to the one shared fetch function).
- **`src/lib/api/messages.ts`**: `sendMessage(token, chatId, idempotencyKey, body)` — the real `POST /api/v1/chats/[chatId]/messages` call, Zod-validated against the now-synced `SendMessageResponseSchema`.
- **`src/hooks/use-messages.ts`**: `useSendMessage(chatId)` — on success, invalidates this chat's messages and the chats list (no optimistic cache write — the send response doesn't carry a full `MessageResponse`, so a refetch is the only correct source of the real persisted state, same philosophy as the existing `useCreateChat`).
- **`src/components/chat/`** (new): `chat-sidebar.tsx` (lists chats via `useChats`, new-chat via `useCreateChat` + navigate, pin/delete via the existing checkpoint-1.4 hooks — included since CLAUDE.md's mandatory scope lists create/read/search/pin/delete; **search was deliberately left out** — the checkpoint's own §3.A list omits it and says "do not invent additional sidebar functionality"), `conversation-view.tsx` (loads messages via `useMessages`, loading/empty/error states, a plain "Load older messages" button reusing the hook's own pagination — no infinite-scroll), `message-list.tsx` (renders only text/thinking/reasoning blocks — advanced content-block/tool-card rendering is explicitly out of scope; PENDING/FAILED/CANCELLED statuses get a plain text treatment, not invented UI), `message-composer.tsx` (idempotency-key lifecycle: fresh key per intentional send, same key reused on a retry of unchanged text, new key once the text changes — see its own header comment), `chat-workspace.tsx` (the shell: fixed sidebar on desktop, a `Sheet` drawer on mobile).
- **Routes**: `/` (no chat selected) and `/chat/[chatId]` (selected chat from the URL, not client state — this is what makes "refresh restores the persisted conversation" true) now render the real workspace, replacing the `create-next-app` scaffold. `/chat/[chatId]/page.tsx` wraps its `params` access in `<Suspense>` — required by this project's pre-existing `cacheComponents: true` Next 16 config, found during the build, not invented.
- **Test infrastructure gap found and fixed**: no prior test in this repo rendered a component and queried it via `screen` across multiple tests in one file (only `renderHook` + `result.current` inspection) — so `@testing-library/jest-dom` matchers were never registered and RTL's `cleanup()` was never called between tests, which this checkpoint's first component tests immediately surfaced as "multiple elements found" failures. Fixed with `src/test-utils/setup-dom.ts` (wired into `vitest.config.mts`'s `setupFiles`, guarded to no-op in the plain `node` environment).
- 19 new tests (41 total, up from 22). `pnpm typecheck`/`pnpm lint`/`pnpm build` all pass.
- Verified live in a real browser (signed-out state only — no Clerk test credentials available in this session): `/` and `/chat/[uuid]` both render correctly on desktop and mobile viewports with zero console/page errors. The actual signed-in send/receive flow was **not** verified live — only through MSW-mocked tests against the real backend contracts; flagged explicitly, not claimed as verified.
- Not done, deliberately, per this checkpoint's explicit "strictly out of scope" list: realtime/Trigger.dev subscriptions, tool-result/generated-media rendering, uploads, plan mode, sign-in UI.

## Next task if resuming cold
1. Read this file + MASTER.md + API_CONTRACTS.md + ARCHITECTURE.md (testing-note section — a known RTL/React-19 quirk and its fix, relevant to any new hook test).
2. Check backend repo's PROJECT_STATE.md for what's actually implemented before building UI on top of it.
3. `git status` + `git log --oneline` here. Checkpoint 3.4.1's changes are uncommitted (not staged either — not yet `git add`ed), per its own explicit "do not commit or push" instruction.
4. `pnpm test` to re-confirm 41/41 still pass.
5. Next work: realtime wiring, tool-result/generated-media rendering, and the upload pipeline, per Phase 3.4's proposed scope — or whatever the user specifies next.
