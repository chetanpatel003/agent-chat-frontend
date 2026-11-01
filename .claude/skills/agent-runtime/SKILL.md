---
name: agent-runtime
description: Implement or debug the provider-neutral durable agent loop, OpenRouter Free streaming/tool calling, skills loading, waitpoints and run lifecycle.
---
# Agent runtime workflow

1. Trace the full path: authenticated send → validation/admission transaction → user message + AgentRun persisted → idempotent Trigger.dev dispatch → session restore → model/tool loop → persisted events/results → terminal message/usage/credits → realtime notification.
2. Use OpenRouter model `openrouter/free` only. No paid fallback. Record actual routed model and token usage.
3. Keep provider-specific request/stream parsing behind an adapter. Validate tool-call arguments with the authoritative Zod schema.
4. Bound max turns, tool calls, stream duration and retries. Handle 429, unavailable free route, empty stream, malformed tool call, timeout, cancellation and partial output.
5. Parallel tool calls only when independent. Preserve deterministic ordering and settle each result/charge once.
6. Enforce one active run per chat and idempotent dispatch. Duplicate sends/retries must not duplicate run, messages, tool effects or charges.
7. Persist every meaningful state transition before broadcasting it. PostgreSQL is durable truth; realtime is delivery.
8. Implement waitpoints with opaque tokens, expiry, authorization, exactly-once resume and duplicate-submission tolerance.
9. Cancellation must be race-safe: stop model/tool work where supported, preserve completed partial outputs, and finalize exactly once.
10. On reload/reconnect, restore server-owned run state and replay/read persisted messages; never depend on browser memory.
11. Keep hidden chain-of-thought private. Render only supported user-visible progress/status or concise summaries; do not fabricate reasoning text.
12. Add tests for success, duplicate dispatch, timeout, 429, malformed tool args, cancellation, reconnect, waitpoint expiry and resume.
