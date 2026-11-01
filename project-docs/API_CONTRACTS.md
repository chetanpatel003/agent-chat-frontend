# API_CONTRACTS — frontend consumption

The backend remains the source of truth (its `project-docs/API_CONTRACTS.md`
documents the actual request/response shapes). This file documents how
this repo consumes them: the typed service modules, the query/mutation
hooks built on top, and the cache strategy — all added in checkpoint 1.4.

## Typed service modules (`src/lib/api/`)
One file per resource, each a thin wrapper over the shared `apiFetch` —
builds the path/query string, calls the backend, validates the response
against the synced Zod contract. No business rules are duplicated here;
only response shape is checked, the same way `me.ts` already did.

- `chats.ts` — `listChats`, `getChat`, `createChat`, `updateChat`, `deleteChat`.
- `messages.ts` — `listMessages`.
- `credits.ts` — `getBalance`, `listLedger`.
- `client.ts` — `apiFetch` (unchanged) + new `toQueryString()` helper, used by every list/search call to build `?cursor=&limit=&q=` consistently.

## Query hooks (`src/hooks/`)
All follow the `useMe()` pattern: `useAuth()` for `getToken`/`isSignedIn`,
`enabled: isSignedIn === true` so a signed-out user never triggers a
request.

| Hook | Type | Notes |
|---|---|---|
| `useChats({q?, limit?})` | `useInfiniteQuery` | `q` is part of the query key (`["chats", q ?? null]`) — a search and the plain list cache independently. |
| `useChat(chatId)` | `useQuery` | |
| `useMessages(chatId, {limit?})` | `useInfiniteQuery` | `getNextPageParam` reads `olderCursor`, not `nextCursor` — `PaginatedMessageResponse` has no `nextCursor` field at all, so getting this wrong is a compile error, not a silent bug. |
| `useCreditBalance()` | `useQuery` | |
| `useCreditLedger({limit?})` | `useInfiniteQuery` | |

## Mutation hooks and cache strategy (`use-chats.ts`)
Four mutations, each deliberately handled differently based on whether
the change affects list **order**:

| Mutation | Cache behavior | Why |
|---|---|---|
| `useCreateChat` | invalidates `["chats"]` | A new chat's position depends on existing pins — correct position is the server's call, not guessed client-side. |
| `useUpdateChatTitle` | patches `["chat", id]` and the matching item in every cached `["chats", *]` page directly, **no refetch** | Title never affects sort order — safe to patch in place. |
| `useTogglePinChat` | patches `["chat", id]`, **invalidates** `["chats"]` | Pin state changes sort order (pinned-first is backend-owned — frontend doesn't re-derive the ranking rule, per architecture boundaries). |
| `useDeleteChat` | removes the chat from every cached `["chats", *]` page directly, **no refetch**; removes `["chat", id]` | Removal needs no reordering logic — safe to patch in place. |

## Auth-failure retry policy (`src/app/providers.tsx`)
The `QueryClient`'s default `retry` returns `false` for any `ApiError`
with status 401 or 403 — retrying won't make an expired/invalid token
valid. Everything else gets up to 2 retries (not the default's
open-ended backoff).

## Contract synchronization
`pnpm sync:contracts` re-copies `agent-chat-backend/src/contracts/*` (the
backend must be checked out as a sibling directory) into
`src/lib/api/contracts/`. Verified in this checkpoint:
- The committed synced copy already matches the backend's current
  contracts (re-ran the sync at the end of checkpoint 1.3; backend made
  no contract changes in 1.4 — `git status` on the backend repo is clean
  for this checkpoint).
- `pnpm build` succeeds using only files inside this repo — confirmed the
  build process never reaches for the sibling repo (the `build` script is
  plain `next build`, no sync step; see PROJECT_STATE.md for the actual
  command run).
- No manually duplicated contract definitions exist outside `src/lib/api/contracts/` — every service module imports from `./contracts`, never redeclares a shape.
