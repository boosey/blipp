# Refactor, Dedupe & Simplify — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate ~400-500 lines of boilerplate by extracting shared helpers for Prisma lifecycle, pagination, queue stage checks, and frontend data fetching.

**Architecture:** Create Hono middleware for Prisma lifecycle, extract shared helpers for admin routes and queue handlers, and add a `useFetch` hook for the frontend. No structural changes to file organization.

**Tech Stack:** Hono middleware, Prisma, React hooks, TypeScript

---

### Task 1: Create shared utility files (BLOCKING — all other tasks depend on this)

**Files:**
- Create: `worker/middleware/prisma.ts`
- Create: `worker/lib/admin-helpers.ts`
- Create: `worker/lib/queue-helpers.ts`
- Create: `src/lib/use-fetch.ts`

**Step 1: Create Prisma middleware**

Create `worker/middleware/prisma.ts`:

```typescript
import { createMiddleware } from "hono/factory";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";
import type { PrismaClient } from "../../src/generated/prisma";

type PrismaEnv = { Bindings: Env; Variables: { prisma: PrismaClient } };

/**
 * Hono middleware: creates a per-request PrismaClient on c.get("prisma")
 * and disconnects automatically via waitUntil.
 */
export const prismaMiddleware = createMiddleware<PrismaEnv>(async (c, next) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  c.set("prisma", prisma);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

**Step 2: Create admin helpers**

Create `worker/lib/admin-helpers.ts`:

```typescript
import type { Context } from "hono";
import { getAuth } from "../middleware/auth";

/** Parse page/pageSize from query params with defaults and max cap. */
export function parsePagination(c: Context) {
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/** Parse sort query param into Prisma orderBy object. */
export function parseSort(c: Context, defaultField = "createdAt") {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [sortField, sortDir] = sort.split(":");
  return { [sortField || defaultField]: sortDir || "desc" } as Record<string, string>;
}

/** Standard paginated response shape. */
export function paginatedResponse<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/** Resolve the current Clerk user to a DB User record. */
export async function getCurrentUser(c: Context, prisma: any) {
  const userId = getAuth(c)!.userId!;
  return prisma.user.findUniqueOrThrow({ where: { clerkId: userId } });
}
```

**Step 3: Create queue helpers**

Create `worker/lib/queue-helpers.ts`:

```typescript
import { getConfig } from "./config";

/**
 * Check if a pipeline stage is enabled. Returns true if enabled or if any
 * message in the batch is manual (manual messages bypass the check).
 */
export async function checkStageEnabled(
  prisma: any,
  batch: MessageBatch,
  stageNumber: number,
  log: { info: (action: string, data: Record<string, unknown>) => void }
): Promise<boolean> {
  const hasManual = batch.messages.some((m) => (m.body as any)?.type === "manual");
  if (hasManual) return true;

  const enabled = await getConfig(prisma, `pipeline.stage.${stageNumber}.enabled`, true);
  if (!enabled) {
    log.info("stage_disabled", { stage: stageNumber });
    for (const msg of batch.messages) msg.ack();
    return false;
  }
  return true;
}

/** Acknowledge all messages in a batch. */
export function ackAll(messages: readonly { ack(): void }[]): void {
  for (const msg of messages) msg.ack();
}
```

**Step 4: Create useFetch hook**

Create `src/lib/use-fetch.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "./api";

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic data-fetching hook that wraps useApiFetch with loading/error state.
 * Fetches on mount and whenever the endpoint changes.
 */
export function useFetch<T>(endpoint: string, options?: { enabled?: boolean }): UseFetchResult<T> {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(endpoint);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, endpoint]);

  useEffect(() => {
    if (options?.enabled === false) return;
    refetch();
  }, [refetch, options?.enabled]);

  return { data, loading, error, refetch };
}
```

**Step 5: Commit**

```bash
git add worker/middleware/prisma.ts worker/lib/admin-helpers.ts worker/lib/queue-helpers.ts src/lib/use-fetch.ts
git commit -m "feat: add shared helpers for Prisma middleware, admin utils, queue utils, useFetch hook"
```

---

### Task 2: Wire Prisma middleware into worker/index.ts and update admin middleware

**Files:**
- Modify: `worker/index.ts`
- Modify: `worker/middleware/admin.ts`
- Modify: `worker/types.ts` (add Variables type)

**Step 1: Update worker/types.ts to include Prisma in Variables**

Add a `HonoEnv` type that includes the Variables for middleware-injected values:

```typescript
import type { PrismaClient } from "../src/generated/prisma";

export type HonoEnv = {
  Bindings: Env;
  Variables: { prisma: PrismaClient };
};
```

This type should be used by all route files instead of `{ Bindings: Env }`.

**Step 2: Add Prisma middleware to worker/index.ts**

After the Clerk middleware line, add:
```typescript
import { prismaMiddleware } from "./middleware/prisma";

// After clerkMiddleware line:
app.use("/api/*", prismaMiddleware);
```

**Step 3: Update admin middleware to use c.get("prisma")**

Replace the manual `createPrismaClient` + try/finally in `worker/middleware/admin.ts` with:
```typescript
export const requireAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const prisma = c.get("prisma");
  const user = await prisma.user.findUnique({
    where: { clerkId: auth.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
```

Remove the `createPrismaClient` import.

**Step 4: Commit**

```bash
git commit -m "feat: wire Prisma middleware into worker entry point and admin middleware"
```

---

### Task 3: Refactor admin routes to use shared helpers

**Files (all in worker/routes/admin/):**
- Modify: `briefings.ts`, `episodes.ts`, `podcasts.ts`, `users.ts`, `pipeline.ts`, `requests.ts`, `dashboard.ts`, `analytics.ts`, `config.ts`

**For each file, apply these changes:**

1. Change `new Hono<{ Bindings: Env }>()` to `new Hono<HonoEnv>()` and import `HonoEnv` from `../../types`
2. Replace `const prisma = createPrismaClient(c.env.HYPERDRIVE);` with `const prisma = c.get("prisma");`
3. Remove the wrapping `try { ... } finally { c.executionCtx.waitUntil(prisma.$disconnect()); }` — middleware handles it
4. Replace pagination parsing blocks with `const { page, pageSize, skip } = parsePagination(c);`
5. Replace sort parsing blocks with `const orderBy = parseSort(c);`
6. Replace `return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });` with `return c.json(paginatedResponse(data, total, page, pageSize));`
7. Remove `createPrismaClient` import, add `parsePagination`, `parseSort`, `paginatedResponse` imports from `../../lib/admin-helpers`
8. Remove duplicate `STAGE_NAMES` definitions — import from `../../lib/config` instead

**Example transformation (briefings.ts GET /):**

Before:
```typescript
const prisma = createPrismaClient(c.env.HYPERDRIVE);
try {
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
  const skip = (page - 1) * pageSize;
  // ...
  const [sortField, sortDir] = sort.split(":");
  const orderBy: Record<string, string> = { [sortField || "createdAt"]: sortDir || "desc" };
  // ... query logic ...
  return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
} finally {
  c.executionCtx.waitUntil(prisma.$disconnect());
}
```

After:
```typescript
const prisma = c.get("prisma");
const { page, pageSize, skip } = parsePagination(c);
const orderBy = parseSort(c);
// ... query logic (unchanged) ...
return c.json(paginatedResponse(data, total, page, pageSize));
```

**Step: Commit after each file or batch of files**

```bash
git commit -m "refactor: admin routes use shared Prisma middleware and helpers"
```

---

### Task 4: Refactor public routes to use Prisma middleware

**Files (all in worker/routes/):**
- Modify: `billing.ts`, `briefings.ts`, `plans.ts`, `podcasts.ts`, `requests.ts`
- Modify: `webhooks/clerk.ts`, `webhooks/stripe.ts`

**For each file:**

1. Change Hono type to `HonoEnv`
2. Replace `const prisma = createPrismaClient(c.env.HYPERDRIVE);` with `const prisma = c.get("prisma");`
3. Remove try/finally disconnect wrappers
4. Where `getAuth(c)!.userId!` + `prisma.user.findUniqueOrThrow({ where: { clerkId: userId } })` appears, replace with `const user = await getCurrentUser(c, prisma);`
5. Remove unused `createPrismaClient` imports

**Step: Commit**

```bash
git commit -m "refactor: public routes use shared Prisma middleware and getCurrentUser"
```

---

### Task 5: Refactor queue handlers to use queue-helpers

**Files (all in worker/queues/):**
- Modify: `feed-refresh.ts`, `transcription.ts`, `distillation.ts`, `clip-generation.ts`, `briefing-assembly.ts`

**Note:** Queue handlers receive `(batch, env, ctx)` directly — NOT Hono context. They keep manual `createPrismaClient` + try/finally. Only the stage-enabled check is refactored.

**For each queue handler, replace the stage-enabled block:**

Before (feed-refresh.ts example):
```typescript
const hasManual = batch.messages.some(
  (m) => (m.body as any)?.type === "manual"
);
if (!hasManual) {
  const stageEnabled = await getConfig(
    prisma,
    "pipeline.stage.1.enabled",
    true
  );
  if (!stageEnabled) {
    log.info("stage_disabled", { stage: 1 });
    for (const msg of batch.messages) msg.ack();
    return;
  }
}
```

After:
```typescript
import { checkStageEnabled } from "../lib/queue-helpers";

if (!(await checkStageEnabled(prisma, batch, 1, log))) return;
```

Apply to all 5 queue handlers with their respective stage numbers (1-5).

**Step: Commit**

```bash
git commit -m "refactor: queue handlers use shared checkStageEnabled helper"
```

---

### Task 6: Refactor frontend pages to use useFetch hook

**Files:**
- Modify: `src/pages/library.tsx`
- Modify: `src/pages/discover.tsx` (partial — subscriptions fetch only)

**Note:** `dashboard.tsx` and `home.tsx` have polling patterns that don't fit a simple useFetch — leave them as-is. The `useFetch` hook is best for straightforward load-on-mount patterns.

**Example transformation (library.tsx):**

Before:
```typescript
const apiFetch = useApiFetch();
const [subscriptions, setSubscriptions] = useState<SubscribedPodcast[]>([]);
const [loading, setLoading] = useState(true);

const fetchSubscriptions = useCallback(async () => {
  try {
    const data = await apiFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
    setSubscriptions(data.subscriptions);
  } catch {
  } finally {
    setLoading(false);
  }
}, [apiFetch]);

useEffect(() => {
  fetchSubscriptions();
}, [fetchSubscriptions]);
```

After:
```typescript
import { useFetch } from "../lib/use-fetch";

const { data, loading, refetch } = useFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
const subscriptions = data?.subscriptions ?? [];
```

**Step: Commit**

```bash
git commit -m "refactor: frontend pages use useFetch hook"
```

---

### Task 7: Remove STAGE_NAMES duplicates

**Files:**
- Modify: `worker/routes/admin/analytics.ts` — remove local STAGE_NAMES, import from `../../lib/config`
- Modify: `worker/routes/admin/dashboard.ts` — same
- Modify: `worker/routes/admin/episodes.ts` — same
- Modify: `worker/routes/admin/pipeline.ts` — same
- Modify: `worker/routes/admin/podcasts.ts` — same

**Note:** The backend admin routes use string-keyed STAGE_NAMES (`"TRANSCRIPTION"` etc.) while config.ts uses numeric keys. Check if the admin routes need a string-keyed variant and add it to config.ts if so, or map appropriately.

**Step: Commit**

```bash
git commit -m "refactor: deduplicate STAGE_NAMES — single source in config.ts"
```

---

### Task 8: Update docs

**Files:**
- Modify: `docs/architecture.md` — add Prisma middleware pattern, mention shared helpers
- Modify: `docs/guides/development.md` — update route pattern examples to show `c.get("prisma")`, document `useFetch`, `parsePagination`, `parseSort`, `checkStageEnabled` helpers
- Modify: `CLAUDE.md` — update Hono Route Pattern to use `c.get("prisma")` instead of manual create/disconnect

**Step: Commit**

```bash
git commit -m "docs: update architecture, dev guide, and CLAUDE.md for refactored patterns"
```

---

## Execution Order

1. **Task 1** (blocking) — Create all shared files
2. **Task 2** (blocking) — Wire middleware into index.ts
3. **Tasks 3, 4, 5, 6, 7** (parallel via Agent Team) — Route refactors, queue refactors, frontend refactors, STAGE_NAMES cleanup
4. **Task 8** — Update docs

## Agent Team Structure

- **Shared contracts** (Task 1+2): Single blocking agent
- **Admin routes** (Task 3): Agent A
- **Public routes** (Task 4): Agent B
- **Queue handlers** (Task 5): Agent C
- **Frontend + STAGE_NAMES** (Task 6+7): Agent D
- **Docs** (Task 8): Final blocking agent
