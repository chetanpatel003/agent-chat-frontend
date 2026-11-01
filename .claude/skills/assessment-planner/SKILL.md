---
name: assessment-planner
description: Convert the Galaxy Agent Chat assessment into a prioritized, testable implementation plan and keep work aligned to its scope, rubric and three-day timebox.
---
# Assessment planner

1. Read the assessment and root `CLAUDE.md`; inspect both repositories before planning.
2. Extract every requirement into `docs/EXECUTION-PLAN.md` with priority, owner/module, dependencies, acceptance evidence and status.
3. Separate mandatory features from bonus features. Never promote bonus work above mandatory acceptance paths.
4. Resolve the frontend/backend repository ambiguity before making irreversible architectural choices: brief says two separate repos but also specifies Next.js Route Handlers.
5. Prioritize the evaluation rubric in this order of weight: architecture 25%, cloning fidelity 20%, reliability 20%, code quality 15%, completeness 10%, polish 10%.
6. Build vertical slices, not disconnected components. Each slice must include API, persistence, UI state, failure handling and tests appropriate to its risk.
7. Estimate in hours, not optimistic story points. Reserve Day 3 time for verification, visual comparison and submission.
8. At every checkpoint, reforecast remaining work. If schedule risk is amber/red, stop optional work and apply the scope fallback.
9. Never silently omit a mandatory requirement. Mark it blocked/partial and state the consequence.
10. Keep a decision log for assumptions, trade-offs and evaluator clarifications.
