---
paths:
  - "**/backend/**"
  - "**/server/**"
  - "**/api/**"
  - "**/*.route.ts"
  - "**/*.handler.ts"
---
# Backend rules
- Authenticate and authorize every request; verify resource ownership in the query/mutation itself.
- Validate all inputs with Zod before business logic. Validate provider responses before persistence.
- Route handlers stay thin; delegate to application services.
- PostgreSQL + Prisma only. Use transactions for multi-record admission and settlement.
- Add unique constraints/idempotency keys for dispatch, tool completion, approval and credit charge.
- Enforce one active run per chat with a database-backed invariant/transaction strategy.
- Use cursor pagination with deterministic `(createdAt, id)` ordering and bounded page sizes.
- Persist state before emitting realtime events.
- Keep all provider credentials server-side; redact secrets and user-sensitive payloads from logs.
- Return safe, non-leaking errors. Never expose stack traces or another user's resource existence.
- Provider adapters must be swappable and must not own chat persistence or credit settlement.
