# TEST_STATUS — actual results

| Check | Last run | Result |
|---|---|---|
| `pnpm typecheck` | checkpoint 1.2 | PASS |
| `pnpm lint` | checkpoint 1.2 | PASS (no issues) |
| `pnpm test` (Vitest+MSW) | checkpoint 1.2 | **PASS — 3/3** (`src/lib/api/client.test.ts`: attaches bearer token, parses error envelope into `ApiError`, refuses to call without a token) |
| `pnpm test:e2e` (Playwright) | — | not yet run, browsers not installed, no UI to test yet |
