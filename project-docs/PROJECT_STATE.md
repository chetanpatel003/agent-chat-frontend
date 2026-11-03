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


## UX polish — optimistic send, auto-scroll, credit visibility (2026-11-03)
- **Optimistic send.** `stores/pending-sends.ts` (Zustand, the first use of the stack's ephemeral-state
  store) holds just-sent messages; `useSendMessage` adds one in `onMutate`, records the persisted
  `messageId` on success, awaits the reconciling messages refetch, then drops it. The list hides an
  admitted entry as soon as the server list contains that id (`visiblePendingSends`), so the two copies
  never render together. Kept out of the TanStack messages cache on purpose: realtime-triggered
  refetches replace that cache and would drop an optimistic entry mid-admission. The composer clears
  at once (the attachment tray hides while pending); on failure the entry is removed, the draft is
  restored and an actionable reason is shown (409 / 503 / 401 / generic). Idempotency is unchanged:
  the restored draft has the same signature, so Retry reuses the same `Idempotency-Key`.
- **Auto-scroll.** `hooks/use-stick-to-bottom.ts`: a "following" ref updated from scroll events
  (within 80 px of the bottom), a `ResizeObserver` on the content (images/videos loading, streamed
  text wrapping), a layout effect on a content key (message count, last status/blocks, streamed
  length, pending count), and an always-scroll when a new send appears. No timers; scrolling never
  re-renders the conversation. `ScrollArea` gained an optional `viewportRef` prop.
- **Per-operation credits.** Generated images/videos show `tool_result.creditsCharged` (written at
  settlement) as e.g. "0.27M credits used", exact value in the tooltip. Null → nothing shown (no zero,
  no estimate, never the provider's raw `creditUsed`). No token counts are shown or invented.
- **Header balance.** `components/chat/credit-balance.tsx` in a header that is now shown on desktop
  too (menu button still mobile-only), via the existing `useCreditBalance` (`CREDIT_BALANCE_KEY`
  exported). Loading skeleton, retryable compact error. Invalidated on `step`, `tool_completed`,
  `tool_failed` and terminal `run_status` events, on the REST "run ended" fallback and on Trigger's
  terminal signal; TanStack's refetch-on-focus picks up later recovery settlements.
- `lib/credits.ts`: `formatCredits` (exact below 100,000; else millions, "0.27M", as Magica shows) and
  `exactCredits`.
- No backend change, no new endpoint, no new dependency, no credit-accounting change.
- Known limitation: an invocation settled later by the recovery sweep (inline settlement failed) has
  `creditsCharged: null` in its persisted tool_result block, so its card shows no usage, though the
  balance and ledger are correct.
- Browser (desktop, live data, no model or Magica calls): header "9.18M credits" (= ledger 9,178,192);
  image card "0.27M credits used" (= 273,936 settled); chat opened scrolled to the last message after
  the image loaded. Optimistic send, failure restore and scroll-up behaviour verified by tests only —
  a live send would start an OpenRouter request. Mobile not visually verified (tool limitation).

## Fix — media URLs in assistant prose (2026-11-03)
Root cause and backend fix: see the backend PROJECT_STATE ("Fix — media URLs in assistant prose").
Frontend: `message-list.tsx` applies the synced `stripMediaReferences` to assistant text blocks and,
with `{ streaming: true }`, to live-streamed text (which never passes the backend's API mapping; a
URL still arriving at the end is held back until complete). Images/videos still render only from
successful tool results, from the same URLs as before; credit usage unchanged. Browser (persisted
data, no model/Magica calls): the affected chat shows the image card, "0.27M credits used" and the
prose, with no provider URL, file list or signed URL; the 03:02 reply shows only its prose.

## Single run status + stage labels (2026-11-03)
**Root cause of the duplicate indicator:** the pending assistant bubble (`PendingBody`) rendered its own
"Thinking…" whenever it had no text yet — including during tool calls — while the status line rendered
"Working — Running generate_image…" for the same run. Now the status line is the only active indicator;
an empty pending bubble shows a silent (aria-hidden) dots placeholder. "Thought for Ns" on finished
messages is unchanged.
- `toCurrentStep` (highest seq wins, so late events can't restore older steps) now includes
  `tool_progress`; a tool step carries `toolInvocationId`, `phase` and the tool's start time.
- Labels: Thinking… → Generating image… → Waiting for image… (after Magica accepted the job) → Writing…,
  with elapsed time ("1m 23s") for thinking and the whole tool call. Edit/crop/merge/skill tools have
  their own labels; unknown tools "Running <name>…". The ticking timer is aria-hidden so the live
  region announces only stage changes.
- `isActive` turns false as soon as a terminal `run_status` (or Trigger's terminal signal for the
  *current* run) arrives, so no stale bar shows while the active-run query catches up.
- Failures keep their existing actionable messages (persisted run reason on the message). Stop and
  Interrupt unchanged.

## Credit usage as operation metadata (2026-11-03)
- One app-generated indicator per billable invocation, directly under its media and before the reply
  text ("273,936 credits charged"; exact value in the tooltip; screen readers get it when abbreviated).
  Several images from one invocation → one indicator; separate invocations → separate indicators.
- `formatCredits`: exact with separators below 1,000,000, then "1.25M" (header balance uses it too).
- Assistant text (persisted and streamed) goes through the synced `sanitizeAssistantText`.
- `useMessages` refetches every 30 s while a successful media result from the last 15 min has no
  settled usage (`awaitsLateSettlement`), so late settlement appears in place, once.
- `src/lib/media-tools.ts`: the shared list of billable media tools.
- Browser: the 08:50 image shows "273,936 credits charged" (then labelled "credits used"); its reply no longer says "It used 273936
  credits." and keeps everything else.

## Terminology: "credits charged" (2026-11-03)
The media label now reads "273,936 credits charged" / "1.25M credits charged" (tooltip "273,936 credits
charged"; screen-reader text "(1,250,000 credits charged)" when abbreviated). The value is the settled
`creditsCharged` — what was taken from the balance — which can be lower than the provider's reported
usage (`creditsUsed`) when the balance ran out, so "used" was inaccurate. Wording only: formatting,
one label per tool call, no label before settlement, late-settlement fill-in and refresh, the header
balance and the model-statement filter are unchanged. Earlier dated entries above quote the label as
it was then ("credits used").
