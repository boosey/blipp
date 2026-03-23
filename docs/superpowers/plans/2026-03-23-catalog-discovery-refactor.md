# Catalog Discovery Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cleanly separate catalog discovery (finding new podcasts) from episode refresh (checking existing pods for new episodes), rename "Catalog Seed" to "Catalog Discovery", and eliminate overlapping feed refresh/prefetch tracking from the seed system.

**Architecture:** CatalogSeedJob stops tracking feed refresh and prefetch — it completes when discovery + upsert is done. After upserting new podcasts, the system auto-creates an EpisodeRefreshJob scoped to those new podcast IDs. The Episode Refresh page handles all episode-level progress from there. Removes seedJobId flow from queue handlers entirely.

**Tech Stack:** Prisma 7, Hono, React 19, Cloudflare Queues

---

## File Structure

**Schema:**
- Modify: `prisma/schema.prisma` — remove feed/prefetch fields from CatalogSeedJob, add catalogSeedJobId to EpisodeRefreshJob

**Queue layer (remove seedJobId tracking):**
- Modify: `worker/lib/queue-messages.ts` — remove seedJobId from FeedRefreshMessage (KEEP seedJobId on CatalogRefreshMessage — still used by catalog-refresh handler)
- Modify: `worker/lib/queue-helpers.ts` — remove isSeedJobActive()
- Modify: `worker/queues/feed-refresh.ts` — remove all seedJobId logic
- Modify: `worker/queues/content-prefetch.ts` — remove seedJobId from message type + tracking

**Catalog refresh (create EpisodeRefreshJob instead):**
- Modify: `worker/queues/catalog-refresh.ts` — after upserting, create EpisodeRefreshJob, queue with refreshJobId, mark seed complete

**Seed routes (simplify):**
- Modify: `worker/routes/admin/catalog-seed.ts` — simplify detail endpoint (discovery only), update ingest final handler, remove feed_refresh/paused statuses, remove pause/resume endpoints
- Modify: `worker/routes/admin/clean-r2.ts` — update bulk-refresh endpoint: remove seedJobId/feedsTotal logic, use refreshJobId instead

**Frontend (simplify + rename):**
- Rename: `src/pages/admin/catalog-seed.tsx` → `src/pages/admin/catalog-discovery.tsx` — single Discovery accordion
- Modify: `src/types/admin.ts` — simplify CatalogSeedJob and CatalogSeedProgress types
- Modify: `src/App.tsx` — rename import + route path
- Modify: `src/layouts/admin-layout.tsx` — rename sidebar label

**Tests:**
- Modify: `worker/queues/__tests__/feed-refresh.test.ts` — remove seedJobId test expectations
- Modify: `src/__tests__/admin/catalog.test.tsx` — if any seed references remain

**Docs:**
- Modify: `docs/admin-platform.md`
- Modify: `docs/data-model.md`

---

## Task 1: Schema Changes (blocking)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/admin.ts`
- Modify: `worker/lib/queue-messages.ts`
- Modify: `worker/lib/queue-helpers.ts`

- [ ] **Step 1: Remove feed/prefetch fields from CatalogSeedJob**

In `prisma/schema.prisma`, remove these fields from `CatalogSeedJob`:
```
  feedsTotal          Int                @default(0)
  feedsCompleted      Int                @default(0)
  prefetchTotal       Int                @default(0)
  prefetchCompleted   Int                @default(0)
```

Update status comment to: `// pending | discovering | upserting | complete | failed | cancelled`

- [ ] **Step 2: Add catalogSeedJobId to EpisodeRefreshJob**

In `prisma/schema.prisma`, add to `EpisodeRefreshJob`:
```prisma
  catalogSeedJobId     String?
```

- [ ] **Step 3: Update frontend types**

In `src/types/admin.ts`:

Remove from `CatalogSeedJob` interface: `feedsTotal`, `feedsCompleted`, `prefetchTotal`, `prefetchCompleted`.

Simplify `CatalogSeedProgress` — remove `episodesDiscovered`, `prefetchBreakdown`, `recentEpisodes`, `recentPrefetch`, and the episode/prefetch pagination fields. Keep: `job`, `podcastsInserted`, `errorCounts`, `pagination` (just podcastPage/podcastTotal), `recentPodcasts`.

Add `catalogSeedJobId?: string | null` to `EpisodeRefreshJob` interface.

- [ ] **Step 4: Remove seedJobId from FeedRefreshMessage only**

In `worker/lib/queue-messages.ts`, remove `seedJobId?: string` from `FeedRefreshMessage`.

**KEEP `seedJobId` on `CatalogRefreshMessage`** — it is still used by the catalog-refresh queue handler to track the CatalogSeedJob through discovery/upserting.

- [ ] **Step 5: Remove seedJobId from ContentPrefetchMessage**

In `worker/queues/content-prefetch.ts`, remove `seedJobId?: string` from `ContentPrefetchMessage`.

- [ ] **Step 6: Remove isSeedJobActive from queue-helpers**

In `worker/lib/queue-helpers.ts`, delete the `isSeedJobActive()` function entirely.

- [ ] **Step 7: Run prisma generate**

```bash
npx prisma generate
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/types/admin.ts worker/lib/queue-messages.ts worker/lib/queue-helpers.ts worker/queues/content-prefetch.ts
git commit -m "refactor: remove feed/prefetch tracking from seed, add catalogSeedJobId to refresh"
```

---

## Task 2: Remove seedJobId from Queue Handlers

**Files:**
- Modify: `worker/queues/feed-refresh.ts`
- Modify: `worker/queues/content-prefetch.ts`
- Modify: `worker/queues/__tests__/feed-refresh.test.ts`

- [ ] **Step 1: Remove seedJobId from feed-refresh handler**

In `worker/queues/feed-refresh.ts`:
1. Remove `import { isSeedJobActive ... }` — only keep `isRefreshJobActive` if used
2. Remove `let seedJobId: string | undefined` and `if (body.seedJobId) seedJobId = body.seedJobId`
3. Remove the cooperative pause/cancel block for seedJobId (lines ~98-105)
4. Remove `...(seedJobId && { seedJobId })` from CONTENT_PREFETCH_QUEUE.sendBatch call
5. Remove `catalogSeedJob.update` for `prefetchTotal` increment
6. Remove `catalogJobError.create` in the catch block
7. Remove `catalogSeedJob.update` for `feedsCompleted` in the finally block
8. Remove the `processed` flag for seedJobId (keep the one for refreshJobId)

- [ ] **Step 2: Remove seedJobId from content-prefetch handler**

In `worker/queues/content-prefetch.ts`:
1. Remove `isSeedJobActive` from import (keep `isRefreshJobActive`)
2. Remove the cooperative pause/cancel block for `msg.body.seedJobId`
3. Remove `catalogSeedJob.update` for `prefetchCompleted`
4. Remove `catalogJobError.create` for seedJobId errors

- [ ] **Step 3: Update feed-refresh tests**

In `worker/queues/__tests__/feed-refresh.test.ts`:
- Remove any test expectations about `seedJobId`, `catalogSeedJob.update`, or `catalogJobError.create`
- Keep tests for `refreshJobId` tracking

- [ ] **Step 4: Run tests**

```bash
npx vitest run worker/queues/__tests__/feed-refresh.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add worker/queues/feed-refresh.ts worker/queues/content-prefetch.ts worker/queues/__tests__/feed-refresh.test.ts
git commit -m "refactor: remove seedJobId tracking from queue handlers"
```

---

## Task 3: Catalog-Refresh Queue — Create EpisodeRefreshJob

**Files:**
- Modify: `worker/queues/catalog-refresh.ts`

- [ ] **Step 1: Read the current file**

Read `worker/queues/catalog-refresh.ts` fully to understand the flow.

- [ ] **Step 2: Update queueFeedRefresh to use refreshJobId**

Change `queueFeedRefresh()` signature and implementation:
- Remove `seedJobId` parameter
- Add `refreshJobId` parameter
- Pass `refreshJobId` instead of `seedJobId` in queue messages

```typescript
async function queueFeedRefresh(env: Env, podcastIds: string[], refreshJobId?: string): Promise<void> {
  if (podcastIds.length === 0) return;
  const messages = podcastIds.map((podcastId) => ({
    body: { podcastId, type: "manual" as const, ...(refreshJobId && { refreshJobId }) },
  }));
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    await env.FEED_REFRESH_QUEUE.sendBatch(messages.slice(i, i + BATCH_SIZE));
  }
}
```

- [ ] **Step 3: After upserting, create EpisodeRefreshJob and complete seed job**

In the main handler, after upserting podcasts and before queuing feed refresh:

1. Create `EpisodeRefreshJob` with `{ trigger: "seed", scope: "seed", status: "refreshing", podcastsTotal: upsertedIds.length, catalogSeedJobId: seedJobId }`
2. Call `queueFeedRefresh(env, upsertedIds, refreshJob.id)` — pass refreshJobId
3. Update CatalogSeedJob to `{ status: "complete", completedAt: new Date() }` (discovery is done)
4. Remove the old `updateSeedJob(prisma, seedJobId, { status: "feed_refresh", feedsTotal: ... })` call

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add worker/queues/catalog-refresh.ts
git commit -m "refactor: catalog-refresh creates EpisodeRefreshJob after discovery"
```

---

## Task 4: Simplify Catalog Seed Routes + Clean R2

**Files:**
- Modify: `worker/routes/admin/catalog-seed.ts`
- Modify: `worker/routes/admin/clean-r2.ts`

- [ ] **Step 1: Read the current file**

Read `worker/routes/admin/catalog-seed.ts` fully.

- [ ] **Step 2: Update ACTIVE_STATUSES**

Change from:
```typescript
const ACTIVE_STATUSES = ["pending", "discovering", "upserting", "feed_refresh", "paused"];
```
To:
```typescript
const ACTIVE_STATUSES = ["pending", "discovering", "upserting"];
```

- [ ] **Step 3: Simplify getJobDetail**

The detail endpoint should only return discovery data. Remove:
- `episodesDiscovered` query
- `prefetchBreakdown` query
- `recentEpisodes` query
- `recentPrefetch` query
- Episode/prefetch pagination
- Lazy completion detection for feedsCompleted/prefetchCompleted (seed completes when upserting is done — this is now handled by catalog-refresh queue)

Keep:
- Job record fetch
- `podcastsInserted` count (podcasts created since watermark)
- `recentPodcasts` paginated list
- Error counts (only "discovery" phase now)
- Podcast pagination

Add: Query for linked `EpisodeRefreshJob` if one exists (where catalogSeedJobId = job.id), return its `id` and `status` so the frontend can link to it.

- [ ] **Step 4: Update POST /:id/ingest final handler**

On `final: true`, instead of queuing feed refresh and setting feedsTotal:
1. Query newly inserted podcasts (same as today)
2. Create `EpisodeRefreshJob` with `{ trigger: "seed", scope: "seed", status: "refreshing", podcastsTotal: count, catalogSeedJobId: id }`
3. Queue to FEED_REFRESH_QUEUE in batches with `refreshJobId`
4. Update CatalogSeedJob to `{ status: "complete", completedAt: new Date() }`
5. Return `{ upserted, errors, final: true, refreshJobId: refreshJob.id }`

- [ ] **Step 5: Remove pause/resume endpoints**

Delete the `POST /:id/pause` and `POST /:id/resume` endpoints entirely. Discovery is fast and doesn't need pause. Keep `POST /:id/cancel`.

Update cancel to accept `discovering` and `upserting` statuses (not just `feed_refresh`/`paused`).

- [ ] **Step 6: Update clean-r2.ts bulk-refresh endpoint**

In `worker/routes/admin/clean-r2.ts`, the `POST /bulk-refresh` endpoint currently uses `seedJobId` to update `feedsTotal` on CatalogSeedJob and passes `seedJobId` in FeedRefreshMessage. Update it to:
1. Accept `refreshJobId` instead of `seedJobId` in the request body
2. Remove the `catalogSeedJob.update` for `feedsTotal`
3. Pass `refreshJobId` in the queue messages instead of `seedJobId`

```typescript
const { podcastIds, refreshJobId } = await c.req.json();
// ...
body: { podcastId, type: "manual" as const, ...(refreshJobId && { refreshJobId }) },
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add worker/routes/admin/catalog-seed.ts worker/routes/admin/clean-r2.ts
git commit -m "refactor: simplify seed routes to discovery-only, spawn EpisodeRefreshJob"
```

---

## Task 5: Simplify + Rename Frontend Page

**Files:**
- Create: `src/pages/admin/catalog-discovery.tsx` (rewrite of catalog-seed.tsx)
- Delete: `src/pages/admin/catalog-seed.tsx`

- [ ] **Step 1: Read current catalog-seed.tsx**

Read `src/pages/admin/catalog-seed.tsx` fully to understand the component structure.

- [ ] **Step 2: Create catalog-discovery.tsx**

Create `src/pages/admin/catalog-discovery.tsx` — a simplified version of catalog-seed.tsx with these changes:

**Remove:**
- Feed Refresh accordion (phase 2)
- Content Prefetch accordion (phase 3)
- Phase stepper (was 3 phases, now just 1 — discovery)
- `overallProgress` weighting for feed/prefetch
- `getPhaseStatuses` — simplify to single phase
- Pause/Resume buttons and handlers
- All references to `feedsTotal`, `feedsCompleted`, `prefetchTotal`, `prefetchCompleted`

**Keep:**
- Discovery accordion showing discovered/inserted podcasts with images, titles, categories
- Errors accordion (phase filter only shows "discovery")
- Trigger buttons (Apple, Podcast Index)
- Delete Catalog button + dialog
- Job list with pagination
- Cancel button + dialog
- Archive button + bulk archive
- Polling for active jobs
- ElapsedTimer, formatDuration, formatTime helpers

**Add:**
- When job is complete and has a linked EpisodeRefreshJob, show a link/badge: "Episode refresh in progress →" that navigates to `/admin/episode-refresh`
- Use `detail.refreshJob` (id + status) from the API response

**Rename:**
- Page title: "Catalog Discovery" (was "Catalog Seed")
- Component: `CatalogDiscoveryPage` (was `CatalogSeed`)
- Status labels: discovery-focused language

**Phase display:**
- Single phase indicator (Discovery) instead of 3-phase stepper
- Progress: `podcastsDiscovered` count + `podcastsInserted` count

- [ ] **Step 3: Delete old catalog-seed.tsx**

Remove `src/pages/admin/catalog-seed.tsx`.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/catalog-discovery.tsx
git rm src/pages/admin/catalog-seed.tsx
git commit -m "refactor: rename Catalog Seed to Catalog Discovery, simplify to discovery-only"
```

---

## Task 6: Update Router, Sidebar, Cron

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/admin-layout.tsx`
- Modify: `worker/lib/cron/pipeline-trigger.ts` (if seedJobId references remain)

- [ ] **Step 1: Update App.tsx**

Change lazy import:
```typescript
const CatalogDiscovery = lazy(() => import("./pages/admin/catalog-discovery"));
```

Change route (keep old path as redirect for bookmarks):
```tsx
<Route path="catalog-discovery" element={<Suspense fallback={<AdminLoading />}><CatalogDiscovery /></Suspense>} />
<Route path="catalog-seed" element={<Navigate to="/admin/catalog-discovery" replace />} />
```

Remove old `CatalogSeed` import.

- [ ] **Step 2: Update sidebar**

In `src/layouts/admin-layout.tsx`, change the Podcasts group entry:
```typescript
{ path: "catalog-discovery", label: "Discovery", icon: Sprout },
```
(Was: `{ path: "catalog-seed", label: "Seed", icon: Sprout }`)

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npx vitest run src/__tests__/admin/catalog.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/layouts/admin-layout.tsx
git commit -m "refactor: rename sidebar and routes from Seed to Discovery"
```

---

## Task 7: Documentation

**Files:**
- Modify: `docs/admin-platform.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Update admin-platform.md**

- Rename "Catalog Seed" references to "Catalog Discovery"
- Update page description to reflect discovery-only scope
- Note that episode refresh is spawned automatically after discovery
- Update API routes table for catalog-seed (remove pause/resume, note simplified detail)

- [ ] **Step 2: Update data-model.md**

- Remove `feedsTotal`, `feedsCompleted`, `prefetchTotal`, `prefetchCompleted` from CatalogSeedJob docs
- Add `catalogSeedJobId` to EpisodeRefreshJob docs
- Update status lifecycle description

- [ ] **Step 3: Commit**

```bash
git add docs/admin-platform.md docs/data-model.md
git commit -m "docs: update for Catalog Discovery rename and simplified schema"
```

---

## Task 8: Schema Push + Verification

- [ ] **Step 1: Mark any in-flight seed jobs as complete**

Before dropping columns, ensure no CatalogSeedJobs are in `feed_refresh` or `paused` status (these statuses no longer exist). Run via psql or a script:

```sql
UPDATE "CatalogSeedJob" SET status = 'complete', "completedAt" = NOW()
WHERE status IN ('feed_refresh', 'paused');
```

- [ ] **Step 2: Push schema (breaking change — column drops)**

```bash
npm run db:push:staging:force
```

- [ ] **Step 2: Full typecheck + test suite**

```bash
npm run typecheck && npm test
```

- [ ] **Step 3: Manual verification**

- Navigate to `/admin/catalog-discovery` — page loads with new name
- Old `/admin/catalog-seed` URL redirects to new path
- Trigger a discovery — job shows single Discovery accordion
- When discovery completes, check that an EpisodeRefreshJob was created
- Navigate to `/admin/episode-refresh` — see the seed-spawned refresh job with progress
- Sidebar shows "Discovery" under Podcasts group

---

## Execution Notes

**Blocking dependency:** Task 1 must complete before all others (schema + types are shared contracts).

**Parallelizable:** Tasks 2+3 (backend queue changes) can run alongside Tasks 5+6 (frontend) after Task 1.

**Sequential:** Task 4 depends on Tasks 2+3 (route handlers reference queue behavior). Task 7 after everything. Task 8 last.

**Backend route path stays `/catalog-seed`** — the GitHub Action calls this endpoint. Only the frontend path and labels change to "Discovery".
