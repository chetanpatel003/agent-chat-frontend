# Agent Chat — frontend

Chat workspace for the Galaxy Agent Chat work trial. Backend and API documentation:
[`agent-chat-backend`](https://github.com/chetanpatel003/agent-chat-backend).

**Stack:** Next.js (App Router) · React · TypeScript (strict) · Clerk · TanStack Query · Trigger.dev
realtime hooks · Uppy + Transloadit (tus) · shadcn/ui + Tailwind · Zod (contracts synced from the
backend) · Vitest + React Testing Library + MSW.

## Features
- Chat sidebar (create, search, pin, delete), paginated history, pinned composer.
- Streaming assistant text, thinking timer, current step, tool activity, stop and interrupt.
- Plan mode with an approval card (approve with a note, or reject); survives reloads.
- Attachments: multi-file uploads with progress, cancel and retry; **media library picker** to
  re-send earlier uploads and generated images/videos in any order.
- Generated images inline; failed, stopped, interrupted and expired turns keep partial output and
  explain what happened.
- Sent messages appear instantly (optimistic, reconciled with the server copy without duplicates;
  a failed send restores the draft). The conversation follows new content only while you are at
  the bottom.
- Credits: the header shows your Magica credit balance, refreshed after billable tools settle;
  each generated image/video shows the credits it actually cost. OpenRouter Free replies cost none.
- Realtime is transport only: everything reconciles from the REST API on reload or disconnect.

## Run locally
```sh
cp .env.example .env.local    # NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_API_URL
pnpm install
pnpm dev                      # http://localhost:3000 (backend on :3001)
```
After a backend contract change: `pnpm sync:contracts`.

## Tests
```sh
pnpm vitest run
pnpm tsc --noEmit && pnpm lint && pnpm build
```

## Deployment
Not deployed yet (needs the owner's Vercel login). See the backend's `project-docs/DEPLOYMENT.md`.
