---
name: architecture-review
description: Review or design the application architecture, data model, contracts, boundaries, scaling and durable execution for this assessment.
---
# Architecture review

Evaluate the proposed change against:
- two separate GitHub repositories;
- Next.js App Router/React/strict TypeScript;
- PostgreSQL + Prisma only;
- Clerk auth;
- REST contracts with Zod;
- Trigger.dev durable execution and realtime;
- OpenRouter Free provider-neutral agent loop;
- typed tool registry and application-owned skills;
- durable waitpoints, idempotency and recovery.

For each design:
1. State the responsibility and data owner of each component.
2. Draw a concise request/event/data flow.
3. Define the authoritative Zod input/output contracts.
4. Identify transaction boundaries, uniqueness constraints and idempotency key.
5. Explain retry, cancellation, duplicate delivery and crash recovery.
6. Identify indexes, pagination and bounded resource use.
7. Identify security/ownership boundaries and secret locations.
8. Identify observability fields and test strategy.
9. Prefer the simplest design that satisfies current acceptance criteria and can extend to 100 skills/tool types and long conversations.
10. Do not claim 1,000 concurrent turns are proven without load-test evidence. Explain what the architecture enables and what infrastructure/testing remains.
Do not refactor unrelated modules during an architecture review.
