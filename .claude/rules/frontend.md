---
paths:
  - "**/frontend/**"
  - "**/app/**"
  - "**/components/**"
  - "**/*.tsx"
---
# Frontend rules
- Match the live Galaxy Agent Chat reference; do not redesign or invent extra features.
- Use TanStack Query for server state and centralized typed service modules for API access.
- Use Zustand only for genuinely client-local/ephemeral state.
- Never scatter raw first-party fetch calls through components.
- Do not trust client-side ownership, limits, credits, model eligibility or tool availability.
- Reconcile active runs from server REST state after reload/reconnect; realtime is not the source of truth.
- Preserve message/content-block ordering and stable keys; avoid duplicate terminal bubbles.
- Make thinking/status, tool pending/success/failure, cancellation and generated assets visually distinct.
- Keep composer pinned and usable on desktop/mobile; provide keyboard and screen-reader support.
- Include loading, empty, error, retry and disabled states. Do not use fake success states.
