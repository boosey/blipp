# Refactor, Dedupe & Simplify Design

**Date**: 2026-03-07
**Branch**: TBD (worktree)

## Problem

The codebase has significant boilerplate duplication:
- 65+ occurrences of Prisma create/try/finally/disconnect
- 6+ admin routes with identical pagination/sort parsing
- 5 queue handlers with duplicated stage-enabled checks
- 15+ occurrences of Clerk userId -> User resolution
- 3+ files with duplicated STAGE_NAMES constant
- 4+ frontend pages with manual useState/useEffect/useCallback fetch patterns

## Changes

### 1. Prisma Middleware (`worker/middleware/prisma.ts`)

Hono middleware that:
- Creates `PrismaClient` per-request
- Sets it on context via `c.set("prisma", client)`
- Disconnects via `c.executionCtx.waitUntil(prisma.$disconnect())` automatically

Applied once in `worker/index.ts`. All routes switch to `c.get("prisma")`.

### 2. Admin Helpers (`worker/lib/admin-helpers.ts`)

- `parsePagination(c)` — returns `{ page, pageSize, skip }`
- `parseSort(c, defaultField?)` — returns Prisma `orderBy` object
- `paginatedResponse(data, total, page, pageSize)` — standard list response shape
- `getCurrentUser(c, prisma)` — resolves Clerk ID to User record

### 3. Queue Helpers (`worker/lib/queue-helpers.ts`)

- `checkStageEnabled(prisma, batch, stageNumber, log)` — shared stage gate that checks for manual override and config
- `ackAll(messages)` — batch acknowledge all messages

### 4. Shared Constants (`worker/lib/constants.ts`)

- `STAGE_NAMES` record — single source of truth for stage display names

### 5. Frontend `useFetch` Hook (`src/lib/use-fetch.ts`)

Generic data fetching hook:
```typescript
function useFetch<T>(endpoint: string, options?: { enabled?: boolean })
  : { data: T | null; loading: boolean; error: string | null; refetch: () => void }
```

Replaces manual useState/useEffect/useCallback fetch patterns across all pages.

## Out of Scope

- Route file consolidation (keep 9 admin route files)
- Component extraction (LoadingSpinner, EmptyState)
- Response mapper extraction (low occurrence count)

## Estimated Impact

- ~400-500 lines of boilerplate eliminated
- Consistent patterns enforced via shared helpers
- Easier to add new routes/pages with less copy-paste
