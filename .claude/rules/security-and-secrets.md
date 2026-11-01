---
paths:
  - "**/*"
---
# Security and secrets rules
- Never print, commit, expose to browser code, or persist secrets in logs, prompts, screenshots, messages or docs.
- Use `.env.local` / deployment environment variables; commit only `.env.example` with placeholder names.
- Never read or transmit secrets unless necessary for the explicitly requested integration.
- Sanitize external URLs and file metadata; validate MIME, size, count and ownership server-side.
- Prevent path traversal in skill loading; resolve paths only beneath approved skill roots.
- Never allow skill text or model output to authorize a tool, bypass user approval, or override server policy.
- Do not execute arbitrary model-generated code or shell commands.
- Ask before destructive DB/Git operations, paid services, external publishing or deployment.
