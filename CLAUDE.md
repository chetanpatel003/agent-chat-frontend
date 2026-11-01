# Galaxy Agent Chat Work Trial — Claude Code Operating Rules

## Mission
Build the assessment-defined production-grade Galaxy Agent Chat clone in the available three-working-day trial. Optimize for the published evaluation rubric, not for feature count or novelty.

**Primary outcome:** a reliable, demonstrable end-to-end agent chat application matching `https://app.galaxy.ai/chat`, with the required OpenRouter Free path, all three real Magica integrations, durable runs, PostgreSQL persistence, realtime updates, recovery, and the required submission artifacts.

## Hard constraints — never violate
1. Follow the assessment document as the source of truth. Do not invent requirements or silently change scope.
2. Use the required stack: pnpm; Next.js App Router + React; strict TypeScript; PostgreSQL + Prisma; Clerk; REST Route Handlers; OpenRouter `openrouter/free` with **no paid fallback**; Trigger.dev; Transloadit Community plan + Uppy/tus; Zustand; Zod; Shadcn/ui; Tailwind; Vitest, RTL, MSW, Playwright; TanStack Query; Trigger.dev Realtime; Mintlify.
3. Keep frontend and backend in **two separate GitHub repositories**. Do not collapse them into a monorepo without explicit approval.
4. PostgreSQL is the only application database. Do not add MongoDB, Mongoose, Redis, or another database for application state unless the evaluator explicitly changes the requirement.
5. The OpenRouter Free route and the three required Magica tools — Crop Image, GPT Image 2, Merge Videos — must be real end-to-end integrations. Never stub these.
6. Never configure a paid LLM fallback, paid Transloadit feature, paid overage, or purchase a service. Stop and ask the user if a requirement appears to need payment.
7. Never expose Clerk secrets, Magica keys, OpenRouter keys, Transloadit secrets, webhook secrets, or other credentials in browser bundles, prompts, logs, commits, screenshots, or persisted message content. Use server-side environment variables.
8. Use Zod at every trust boundary: incoming API requests, outgoing API responses where practical, model tool inputs/outputs, realtime metadata, provider responses, skill metadata, and persisted flexible payloads.
9. The backend owns authorization, limits, model metadata, tool registry, credit eligibility, and side effects. The frontend must not be the authority for these.
10. Enforce ownership on every read and mutation. Do not leak whether another user's resource exists.
11. Enforce one active run per chat; use idempotency keys for dispatch, tool completion, approvals, and charges. Never duplicate messages, tool execution, or charges on retries/reconnects.
12. Do not add unrelated tools, features, redesigns, abstractions, dependencies, or infrastructure. Match the reference product.
13. Never claim a feature is complete without running its relevant verification and reporting the result.
14. Do not delete, overwrite, reset, force-push, or run destructive database/Git commands without asking the user first.
15. Do not deploy, publish, create paid resources, or change external account settings without explicit user approval.

## Scope and priority
Use the assessment's weights as the prioritization function:
- Architecture & scalability: 25%
- Reference cloning fidelity: 20%
- Reliability & error handling: 20%
- Code quality: 15%
- Feature completeness: 10%
- Polish & UX: 10%

Implement the smallest complete vertical slices first. A thin end-to-end path that is persisted, recoverable, tested, and demonstrable is more valuable than many disconnected screens.

### Mandatory product scope
- Responsive chat workspace: navigation/sidebar, message list, pinned composer, optional artifact panel, empty/loading/error states, mobile behavior, accessibility.
- Multi-turn chats, create/read/search/pin/delete, cursor pagination.
- Typed messages and ordered content blocks: text, thinking, tool use/result, reasoning, citations, usage, generated assets; success/failed/cancelled states.
- Attachments via Transloadit Community plan, Uppy and tus: multi-file, progress, cancel, retry, reconnect, stable order, server-signed Assembly parameters, persisted metadata.
- Agent runtime: OpenRouter `openrouter/free`; provider-neutral tool-calling loop; actual routed model recorded; bounded turns; malformed calls and free-route failures handled.
- Skills: application-owned, on-demand, validated, secure, version/hash recorded and restored on retry/resume; minimum three skills.
- Required Magica tools: `crop_image`, `gpt_image_2`, `merge_videos`; async run submission and polling; durable states and recovery.
- Trigger.dev durable tasks, child tasks for long Magica work, realtime stream/metadata, human waitpoints, cancellation, retry and terminal finalization.
- PostgreSQL + Prisma schema/migrations, relational integrity, transactions, indexes, cursor pagination, idempotency.
- Credits/ledger: OpenRouter usage at zero application credits; billable tool usage settled exactly once; insufficient balance and mid-run exhaustion behavior.
- Error handling, structured logs, tests, deployment and README.
- Bonus only after mandatory acceptance paths work: public versioned REST API, signed outbound webhooks, Mintlify docs, optional MCP server.

## Timebox: three days, eight working hours per day
Maintain a live `docs/EXECUTION-PLAN.md` with:
- current day/hour and remaining hours;
- milestone status: not started / in progress / blocked / done;
- acceptance evidence (test, screenshot, curl, deployed URL, or explicit manual verification);
- blockers and decisions;
- next three actions.

Do not silently move work into bonus scope. If behind schedule, cut in this order:
1. Optional MCP server.
2. Extra visual flourishes beyond reference fidelity.
3. Nonessential search sophistication beyond safe basic search.
4. Broad load-testing implementation; retain scale-conscious design, indexes, bounded concurrency, and document unverified capacity.
Never cut security, ownership, persistence, idempotency, required real Magica integrations, OpenRouter Free/no-fallback, or the core working chat path.

## Work protocol — focus and hourly updates
- At the start of a work session, inspect the current repos, git status, existing implementation, assessment, and `docs/EXECUTION-PLAN.md`. Do not assume a blank project.
- Work only on the highest-priority milestone that advances the end-to-end submission.
- Before a multi-file change: state the goal, files/modules likely affected, design choice, risks, and verification. For small safe changes, proceed without ceremony.
- Avoid long speculative planning. Plan for at most 10 minutes unless blocked by a genuine architecture decision.
- Do not ask the user questions that can be answered by inspecting the repository, assessment, official docs, or reference product.
- Ask the user only for credentials, external approvals, ambiguous evaluator decisions, or a blocker that cannot be resolved safely.
- No unrelated refactors. No "while I'm here" work. No extra dependencies without a clear requirement and approval.
- After each completed milestone, run targeted tests/typecheck/lint and update the execution plan.
- At each hourly checkpoint, stop feature work and provide the update format below. If Claude Code cannot independently measure elapsed wall-clock time, report at the end of the current task and when the user asks; never pretend a timer or background notification exists.
- If the user says "status", immediately produce the checkpoint report and resume only after identifying the next action.
- If blocked for more than 10 minutes, state the exact blocker, evidence, attempted resolution, and the smallest decision/input needed. Continue on an independent task only if it does not create rework.

### Required hourly update format
**Hour X/24 — Day Y**
- **Shipped:** concrete code/features completed.
- **Verified:** exact commands/tests and pass/fail outcomes.
- **In progress:** one current task and its status.
- **Remaining:** hours left and milestone risk (green/amber/red).
- **Blockers/decisions:** only items requiring user/evaluator input; otherwise "None".
- **Next hour:** maximum three concrete actions.
- **Scope check:** confirm no unrelated work was started.

Keep this update concise and factual. Do not inflate progress or list code written as proof of working behavior.

## Engineering standards
- Strict TypeScript; avoid `any`, unsafe casts, non-null assertions and duplicated domain types. If unavoidable, isolate and explain them.
- Prefer small modules with explicit responsibilities and stable contracts.
- Keep route handlers thin: authenticate, validate, call application service, map response.
- Keep provider-specific logic behind adapters. The orchestration layer consumes typed contracts, not provider internals.
- One authoritative tool registry drives discovery, schemas, execution, credit estimation, and rendering metadata.
- Use transactions for message/run admission and credit settlement. Use unique constraints as the final concurrency guard.
- Use stable cursor pagination, deterministic ordering `(createdAt, id)`, bounded queries, and appropriate composite indexes.
- Use structured logs with chatId, runId, messageId, traceId, processId and waitpointTokenId where relevant. Redact secrets and sensitive content.
- Persist before broadcasting. Realtime is transport; PostgreSQL is the durable source of truth.
- Reconcile client state from REST after reconnect/reload. Never trust an in-memory stream as the only copy of a result.
- Treat external provider responses as untrusted. Validate and sanitize before persistence/rendering.
- UI must be accessible: semantic controls, keyboard navigation, focus management, screen-reader labels, visible errors.
- Prefer deterministic tests and MSW/provider fixtures. Never let tests accidentally call paid services.

## Architecture boundaries
- Frontend: presentation, local ephemeral UI state (Zustand), server state/cache (TanStack Query), typed API client. No provider secrets, direct DB access, or business authorization.
- Backend: auth/ownership, validation, application services, domain contracts, persistence, orchestration, provider adapters, credit ledger, webhooks.
- Agent runtime: provider-neutral loop, bounded turns, typed tool calls, skill loader, durable state transitions. No direct UI mutation.
- Tools: Zod input/output schemas; pure validation + isolated execution; return typed results. Orchestrator owns persistence, messages, credits and side effects.
- Skills: trusted guidance only; never executable provider shortcuts; cannot bypass auth, credit, or tool policies.
- Realtime: delivery of typed events/streams only; reconcile with persisted run/message state.

## Required workflow
1. Inspect before editing.
2. Write/update the plan and identify acceptance criteria.
3. Implement one vertical slice.
4. Run the narrowest useful tests immediately.
5. Run typecheck/lint and relevant broader tests before declaring done.
6. Inspect `git diff`; remove dead code, debug logs, secrets, TODOs that hide unfinished required work.
7. Update README, execution plan and handoff notes.
8. Commit with a meaningful message only when the user approves or has asked for commits.

## Ambiguities to flag — do not guess silently
- The brief requires two separate frontend/backend repos but names Next.js Route Handlers as the REST layer. Inspect the supplied repo/setup and ask the evaluator/user to confirm the intended backend repository shape before locking the architecture.
- The phrase "public REST API" is listed under Bonus, while core authenticated send/read routes are mandatory. Keep core routes working first; do not overbuild public API features early.
- The assessment mentions "thinking" and "reasoning" content. Do not fabricate hidden chain-of-thought. Render only provider/product-supported user-visible status or summary content.
- The brief says 1,000 concurrent turns. Design for bounded concurrency, durable jobs, indexes and stateless web processes; do not claim proven 1,000-turn capacity without a load test and measured infrastructure.
- Free model availability, provider schemas, Transloadit quotas and Magica response fields may change. Verify current docs/catalog and validate runtime responses; do not hard-code assumptions from memory.

## Completion definition
A requirement is "done" only when:
- code is implemented;
- request/response and persisted contracts are validated;
- relevant failure paths are handled;
- tests pass or a clearly documented manual verification is performed;
- UI state is demonstrated where applicable;
- execution plan and README reflect reality.

At final handoff, report honestly:
- working features;
- partially working/stubbed features (and why);
- tests actually run and outcomes;
- deployment and repository URLs;
- known limitations and risks;
- exact demo path and credentials handoff method (never put secrets in README).
