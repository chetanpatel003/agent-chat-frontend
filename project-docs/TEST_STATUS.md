# TEST_STATUS — actual results

| Check | Last run | Result |
|---|---|---|
| `pnpm typecheck` | checkpoint 1.3 (re-confirmed after contract re-sync) | PASS |
| `pnpm lint` | checkpoint 1.3 | PASS (no issues) |
| `pnpm test` (Vitest+MSW) | checkpoint 1.3 | **PASS — 3/3**, unchanged (`src/lib/api/client.test.ts`: attaches bearer token, parses error envelope into `ApiError`, refuses to call without a token) |
| `pnpm test:e2e` (Playwright) | — | not yet run, browsers not installed, no UI to test yet |
