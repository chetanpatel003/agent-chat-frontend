# Three-Day Execution Plan

> 24 working hours total. Re-plan from actual repository state. This is a prioritization plan, not permission to fake completion.

## Day 1 — Establish the durable vertical slice (Hours 1–8)
1. Inspect both repositories, reference product, credentials/docs, environment and git status. Resolve repo/backend architecture ambiguity.
2. Create execution plan, architecture diagram, env example, lint/typecheck/test scripts and CI baseline.
3. Define Prisma domain model and first executable migration: User/Clerk identity mapping, Chat, Message, AgentRun, Attachment, ToolInvocation, RunSkill, Waitpoint, CreditLedger as needed.
4. Implement Clerk auth + ownership helper + Zod request/response contracts.
5. Implement create/list/read chat and cursor-paginated messages.
6. Implement send-turn admission transaction: persist user message + AgentRun + idempotency key; enforce one active run per chat.
7. Implement Trigger.dev durable dispatch and run status persistence.
8. Build the reference-matched shell/composer/message list and connect the first persisted send/read path.

**Day 1 exit gate:** authenticated user can create/open a chat, send a message, see persisted user/assistant run state, refresh and read it back. No duplicate active run on repeated send.

## Day 2 — Real agent, skills, Magica tools and realtime (Hours 9–16)
9. Implement OpenRouter `openrouter/free` streaming and provider-neutral tool-calling loop; no paid fallback; bounded turn count.
10. Add actual routed-model and token-usage capture; handle 429, unavailable route, empty/malformed stream, timeout, cancellation.
11. Implement typed tool registry and three minimum application-owned skills with secure on-demand loader and run hash persistence.
12. Implement Magica adapter: configurable base URL, server-only bearer key, submit `POST /v1/nodes/{nodeType}/run`, persist runId, poll `GET /v1/nodes/runs/{runId}`.
13. Implement and validate `crop_image`, `gpt_image_2` text/edit modes, `merge_videos`; add one success test per tool and a chained flow.
14. Implement Trigger.dev Realtime typed run metadata/text stream; persist before publish; client subscribes and reconciles via REST.
15. Add waitpoint token lifecycle (create, pause, approve/reject, expire, resume exactly once), cancellation and duplicate submission protection.
16. Test reload/reconnect, retry, tool failure, duplicate dispatch and terminal finalization.

**Day 2 exit gate:** a real OpenRouter conversation works; the agent can discover and call each required Magica tool; results persist and render; refresh/reconnect recovers run state.

## Day 3 — Uploads, reliability, fidelity and submission (Hours 17–24)
17. Implement Transloadit Community + Uppy/tus uploads: signed server Assembly params, progress, cancel, retry, stable ordering, persisted metadata, quota/size/MIME validation.
18. Complete generated asset rendering and attachment previews; verify expiry/failure handling.
19. Complete credit balance/ledger and idempotent settlement; OpenRouter usage remains zero application credits; billable tool costs settle once.
20. Finish chat management: cursor pagination, title/message search, pin/favorite, delete with ownership checks.
21. Reliability pass: concurrency races, partial output, cancellation races, stale waitpoints, credit exhaustion, auth/ownership, provider errors.
22. Visual fidelity pass against live Galaxy reference: spacing, composer, sidebar, message widths, tool cards, loading/empty/error states, responsive behavior and keyboard access.
23. Run unit/integration/E2E tests, typecheck, lint, production build; fix highest-severity failures. Deploy only after user approval and verify deployed smoke path.
24. Finish README, migrations/rollback notes, architecture/trade-offs, known limitations, Mintlify core docs if time, <=5-minute demo plan, both repo URLs and handoff.

**Day 3 exit gate:** demonstrable working app, no known critical security/data-integrity defect, required Magica success paths tested, deployment smoke-tested, honest README and demo.

## Scope fallback rules
- First preserve: auth/ownership, persisted chat, durable run, OpenRouter Free, required Magica integrations, idempotency, recovery, core UX.
- Then preserve: skills system, uploads, credits, chat management, tests and visual fidelity.
- Bonus public API/webhooks/Mintlify expansion/MCP only after mandatory paths. A minimal useful Mintlify API reference is preferable to an MCP server.
- If a feature cannot be completed, implement a truthful typed boundary and document it; do not pretend a stub is real.
