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
