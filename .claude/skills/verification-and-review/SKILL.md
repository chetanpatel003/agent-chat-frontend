---
name: verification-and-review
description: Run a focused quality, security, reliability and acceptance review before declaring a milestone or submission complete.
---
# Verification workflow

1. Identify the exact acceptance criteria for the changed feature.
2. Run targeted unit/integration tests first; then typecheck, lint and relevant E2E tests.
3. Review auth/ownership, Zod validation, secret exposure, transaction boundaries, idempotency, retry/cancel races, partial results and safe error messages.
4. Inspect DB query bounds, indexes, cursor stability and N+1/unbounded scans.
5. Inspect realtime persistence/reconciliation and duplicate terminal message behavior.
6. Inspect UI loading/empty/error/retry/accessibility/responsive states.
7. Review `git diff` for unrelated changes, debug logs, secrets, dead code and fake success paths.
8. Report findings by severity: Critical, High, Medium, Low; include file/line, impact, reproduction/evidence and smallest fix.
9. Fix Critical/High findings before proceeding. Do not silently expand scope to low-priority refactors.
10. State exact commands and pass/fail results. If a test was not run, say so.
