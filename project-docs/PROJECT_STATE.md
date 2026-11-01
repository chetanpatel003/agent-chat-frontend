# PROJECT_STATE — frontend

Full chronological narrative: `~/Desktop/chat/progress.md` (workspace-level, not currently git-tracked anywhere — flagged in backend's PROJECT_STATE.md).

## Day / hour
Day 1 of 3. Setup complete. No product code yet — backend's Phase 1 (Prisma schema) is the current gate; frontend work starts after backend has a contracts folder to sync from.

## Environment — verified
Clerk keys match backend's. `NEXT_PUBLIC_API_URL=http://localhost:3001` set.

## Implemented
Scaffolding only: Next.js 16 + Tailwind 4 + shadcn (radix-nova, 13 base components) + TanStack Query/Virtual + Zustand + Uppy/Transloadit + test tooling. No screens, no API client.

## Next task if resuming cold
1. Read this file + MASTER.md.
2. Check backend repo's PROJECT_STATE.md for what contracts/routes actually exist.
3. `git status` + `git log --oneline` here.
4. Don't start a screen until the backend contract it depends on is implemented (sync script not yet written — check backend ARCHITECTURE.md).
