---
name: hourly-checkpoint
description: Produce the mandatory concise hourly progress report, update the execution plan, identify schedule risk, and select the next highest-priority actions. Use at hourly boundaries or whenever the user asks for status.
---
# Hourly checkpoint

1. Inspect `docs/EXECUTION-PLAN.md`, current git diff/status, recent commits, and relevant test output.
2. Compare actual working behavior against the current hour's acceptance criteria. Code written is not proof of behavior.
3. Update the plan with status, evidence, blocker, and remaining hours.
4. Report exactly:

**Hour X/24 — Day Y**
- **Shipped:** observable implementation.
- **Verified:** exact commands/tests and outcomes.
- **In progress:** one active task.
- **Remaining:** hours and green/amber/red risk.
- **Blockers/decisions:** only actionable items.
- **Next hour:** up to three actions.
- **Scope check:** confirm no unrelated work.

5. If behind, identify the lowest-value scope to defer using the fallback order in root CLAUDE.md.
6. Do not invent elapsed time. Claude Code cannot guarantee a background hourly notification; checkpoint when the user returns/asks or at a task boundary approximating the hour.
7. After reporting, resume the highest-priority next action unless the user asked only for status.
