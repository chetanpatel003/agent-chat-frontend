# MASTER — permanent requirements and constraints

Full source: assessment doc (pasted in conversation) + `/CLAUDE.md` (playbook, repo root, not committed). Backend's authoritative copy: https://github.com/chetanpatel003/agent-chat-backend/blob/main/project-docs/MASTER.md

## Evaluation weights
Architecture & scalability 25% · Cloning fidelity 20% · Reliability 20% · Code quality 15% · Feature completeness 10% · Polish/UX 10%.

## Hard constraints (frontend-relevant)
- Separate repo from backend (this is the frontend). Calls backend via Clerk bearer tokens — never trusts its own client-side state for ownership/limits/credits/model eligibility.
- Centralized typed API service modules + TanStack Query only. No raw fetch scattered through components.
- Zustand only for genuinely client-local/ephemeral state.
- Match the live Galaxy reference (https://app.galaxy.ai/chat) exactly where it's in scope — see decisions/0004 (backend repo) for what's functional vs. visual-only.
- Reconcile active runs from backend REST after reload/reconnect — realtime is transport, never the source of truth.
- Secrets never reach browser code (Clerk secret key, API keys all stay backend-only).

## Reference product
https://app.galaxy.ai/chat

## Repos
- Frontend (this repo): https://github.com/chetanpatel003/agent-chat-frontend (private)
- Backend: https://github.com/chetanpatel003/agent-chat-backend (private) — owns DATABASE.md, API_CONTRACTS.md, TOOL_REGISTRY.md, decisions/.
