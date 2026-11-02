# TEST_STATUS — actual results

| Check | Last run | Result |
|---|---|---|
| `pnpm typecheck` | checkpoint 1.4 | PASS |
| `pnpm lint` | checkpoint 1.4 | PASS (no issues) |
| `pnpm test` (Vitest+MSW+RTL) | checkpoint 1.4 | **PASS — 22/22** (4 files, up from 1) |
| `pnpm build` (production) | checkpoint 1.4 | **PASS** — `next build` succeeds; route listing confirms `/` static, middleware registered |
| `pnpm test:e2e` (Playwright) | — | not yet run, browsers not installed, no UI to test yet |

## Checkpoint 1.4 test breakdown
- `src/lib/api/client.test.ts` (8, up from 3): +1 invalid/expired-token-vs-missing-token distinction, +3 `toQueryString()`.
- `src/hooks/use-chats.test.tsx` (9, new): token attachment, signed-out no-fetch, 401 no-retry, next-page cursor, search `q` param, 4 mutation cache-behavior tests (patch-in-place for title, invalidate for pin, remove-in-place for delete, invalidate for create).
- `src/hooks/use-messages.test.tsx` (3, new): no-fetch without a chatId, first page, older-page using `olderCursor` specifically (not `nextCursor` — caught at compile time by the contract, verified at runtime here too).
- `src/hooks/use-credits.test.tsx` (3, new): balance fetch, signed-out no-fetch, ledger first page.

**Coverage by checkpoint 1.4's required test list:** Clerk token attachment ✓, missing token ✓, invalid/expired token ✓, API error parsing ✓, chat query hooks ✓, message pagination cursor handling ✓ (direction verified, not just presence), credit query hooks ✓, mutation cache invalidation ✓ (both invalidate and patch-in-place paths, each justified), contract/type compatibility ✓ (every service module validates its response against the synced Zod schema; `useMessages`'s cursor field is typed, not stringly-keyed, so using the wrong field name is a compile error).

| `pnpm typecheck` | checkpoint 3.4.1 | PASS |
| `pnpm lint` | checkpoint 3.4.1 | PASS (no issues) |
| `pnpm test` (Vitest+MSW+RTL) | checkpoint 3.4.1 | **PASS — 41/41** (8 files, +19 new, +4 new files) |
| `pnpm build` (production) | checkpoint 3.4.1 | **PASS** — `/` static, `/chat/[chatId]` partially prerendered (Next 16 Cache Components mode; required a `<Suspense>` boundary around `params` access, found during the build, not assumed) |
| Live verification (real browser, dev servers) | checkpoint 3.4.1 | **Signed-out rendering only** — `/` and `/chat/[uuid]` both confirmed via a real Chrome instance (desktop 1280×720 and mobile 390×844 viewports), zero console/page errors in either. **The signed-in send/receive flow was not live-verified** — no Clerk test credentials were available in this session; stated as a known gap, not claimed as tested. |

**Test infrastructure gap found and fixed, not papered over:** this checkpoint's component tests were the first in this repo to `render()` a component and query it via `screen` across more than one test in a file (every prior test used `renderHook` + `result.current`, never touching `screen`). Two things were consequently missing project-wide: `@testing-library/jest-dom`'s matchers were never registered (`toBeInTheDocument`/`toHaveAttribute` failed with "Invalid Chai property"), and RTL's `cleanup()` was never called between tests, so unmounted trees accumulated within a file and later tests hit "multiple elements found" errors querying text that existed in more than one leftover render. Fixed with `src/test-utils/setup-dom.ts`, registered via `vitest.config.mts`'s new `setupFiles` entry, explicitly guarded (`typeof document !== "undefined"`) so it stays a no-op for the existing plain-`node`-environment tests.

**New tests by file:**
- `src/components/chat/message-list.test.tsx` (+4): user/assistant distinction via `data-role`, PENDING → "Thinking…", FAILED → error text, text/thinking/reasoning blocks joined while tool_use/tool_result blocks are skipped.
- `src/components/chat/message-composer.test.tsx` (+6): sends through the real endpoint with a non-empty `Idempotency-Key` and clears on success; a second click while pending never fires a second request; a failed send preserves the draft and **reuses the same key** on Retry; editing the draft after a failure generates a **new** key on the next send; whitespace-only text is never sent.
- `src/components/chat/chat-sidebar.test.tsx` (+5): chats load and display via `useChats`; a null title falls back to "Untitled chat" without crashing; creating a chat navigates to `/chat/[newId]`; empty state; the selected chat gets `aria-current="page"`.
- `src/components/chat/conversation-view.test.tsx` (+4): no-chat-selected state; messages load via `useMessages`; empty and error states; switching `chatId` never leaks the previous chat's messages (proven against the hook's own per-key caching directly, not just the extra remount-by-`key` safety net in `ChatWorkspace`).

**Coverage by this checkpoint's required test list (§6):**
1. Chat list loads and displays ✓ (`chat-sidebar.test.tsx`)
2. Selecting a chat loads its messages ✓ (`conversation-view.test.tsx`)
3. Creating a chat selects/opens it ✓ (`chat-sidebar.test.tsx`, asserts `router.push` to the new id)
4. Messages render with correct sender distinction ✓ (`message-list.test.tsx`)
5. Sending calls the correct endpoint with the required idempotency header ✓ (`message-composer.test.tsx`)
6. Duplicate submission prevented ✓ (`message-composer.test.tsx`)
7. Failed admission preserves the draft ✓ (`message-composer.test.tsx`)
8. Pending assistant messages represented correctly ✓ (`message-list.test.tsx` — "Thinking…"; not independently re-tested at the `ConversationView` integration level, since `MessageList` is the one place that renders a message's status and is exercised directly)
9. Switching chats does not leak messages ✓ (`conversation-view.test.tsx`)
10. Reloading restores persisted chats and messages — **structurally ensured, not independently browser-tested**: `selectedChatId` comes from the URL (`/chat/[chatId]`), never client-only state, and both `useChats`/`useMessages` fetch fresh from the real backend on mount with no `localStorage`/session persistence substituting for it; confirmed in a real browser only for the signed-out case (no live Clerk session to reload against)
11. Loading, empty, and error states ✓ (`chat-sidebar.test.tsx`, `conversation-view.test.tsx`)
