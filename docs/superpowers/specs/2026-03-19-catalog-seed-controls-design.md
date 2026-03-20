# Catalog Seed Controls: Pause, Cancel, and Confirmation Dialog

## Overview

Add pause/cancel controls to catalog seed operations and replace the bare `window.confirm()` with a proper verification dialog requiring type-to-confirm.

## Job Status Flow

Current: `pending -> discovering -> upserting -> feed_refresh -> complete | failed`

New additions:
- `feed_refresh` can transition to `paused` or `cancelled`
- `paused` can transition to `feed_refresh` (resume) or `cancelled`
- `cancelled` is terminal (like `complete` or `failed`)

Pause/cancel are only available during `feed_refresh` — Phase 1 (discovering/upserting) runs as a single queue message in ~10-30s and is not worth interrupting. The UI disables pause/cancel buttons during Phase 1 with a tooltip.

The `status` field is already a plain `String` on `CatalogSeedJob` — no schema migration needed.

## Backend

### Existing Route Updates (`worker/routes/admin/catalog-seed.ts`)

**`GET /active`**
- Add `"paused"` to the active-job query filter: `status: { in: ["pending", "discovering", "upserting", "feed_refresh", "paused"] }`
- The `isActive` check on the backend already gates lazy completion on `job.status === "feed_refresh"`, so paused jobs won't accidentally trigger completion. Adding `"paused"` to the query filter just ensures paused jobs are found and returned to the frontend.

**`POST /`** (start seed)
- Add `"paused"` to the active-job guard: a new seed cannot start while one is paused

### New Routes

**`POST /:id/cancel`**
- Validates job exists and status is `feed_refresh` or `paused`
- Sets `status = "cancelled"`, `completedAt = now()`
- Returns updated job
- Error responses: 404 if job not found, 409 if status transition is invalid

**`POST /:id/pause`**
- Validates job exists and status is `feed_refresh`
- Sets `status = "paused"`
- Returns updated job
- Error responses: 404 if job not found, 409 if status transition is invalid

**`POST /:id/resume`**
- Validates job exists and `status = "paused"`
- Sets `status = "feed_refresh"`
- Resets `feedsCompleted = 0` and `prefetchCompleted = 0`
- Re-discovers remaining work from the DB:
  - **Feeds**: All podcasts with `createdAt >= job.startedAt` — re-queued in full. Feed-refresh is idempotent (upserts episodes), so already-processed podcasts just re-fetch their feed (~100ms overhead each). This avoids needing per-podcast completion tracking.
  - **Prefetch**: Episodes with `createdAt >= job.startedAt` and `contentStatus = 'PENDING'` — exactly the unprocessed ones.
- Updates `feedsTotal` to the count of re-queued podcasts and `prefetchTotal` to the count of pending episodes
- Re-queues messages with `seedJobId`
- Error responses: 404 if job not found, 409 if status is not `paused`

**Why reset counters on resume:** Re-queuing all feeds means already-completed feeds will re-increment `feedsCompleted`. Rather than tracking per-podcast completion state, resetting counters gives an accurate progress bar for the resume batch. The data from before pause is preserved in the DB — only the progress counters restart.

### Queue Consumer Changes

**`feed-refresh.ts`**
- Note: `max_batch_size` is 1, so each invocation processes exactly one message with one podcast. The status check runs once per invocation.
- Before processing the podcast, if `seedJobId` is set: call `isSeedJobActive()`. If not active, skip processing entirely — ack the message without doing work.
- **Important structural change:** The current code increments `feedsCompleted` in a `finally` block that always runs. This must be made conditional — only increment when the podcast was actually processed, not when skipped due to paused/cancelled status.

**`content-prefetch.ts`**
- Per-message processing (not batched). Check job status at the start of each message. If not active: `msg.ack()` without processing, do not increment `prefetchCompleted`.

**`catalog-refresh.ts`** (Phase 1)
- No changes needed. Phase 1 runs as a single queue message and completes before pause/cancel can be set (pause is only available during `feed_refresh` phase, which starts after Phase 1 fans out).

### Helper: Job Status Check

Shared helper (can live in `worker/lib/queue-helpers.ts`):
```typescript
async function isSeedJobActive(prisma: any, seedJobId: string): Promise<boolean> {
  const job = await prisma.catalogSeedJob.findUnique({
    where: { id: seedJobId },
    select: { status: true },
  });
  if (!job) return false;
  return !["paused", "cancelled", "complete", "failed"].includes(job.status);
}
```

One DB query per podcast/episode — lightweight.

### Race Condition Acknowledgment

Between the admin clicking "Pause" and the status being written to DB, some queue messages may already be past the status check and actively processing. With `max_concurrency` on feed-refresh, a few feeds may complete after pause is set. This is expected — the counters will reflect the actual work done, and the next poll will show the final state. The UI should not treat this as an error.

## Frontend

### Confirmation Dialog (`src/pages/admin/catalog-seed.tsx`)

Replace `window.confirm()` with a shadcn `AlertDialog`:

- **Title**: "Start Catalog Seed"
- **Body**: Explains the 3 phases and warns about data deletion:
  - Phase 1: Discovers ~2000 podcasts from Podcast Index
  - Phase 2: Fetches RSS feeds for each podcast, pulling episodes
  - Phase 3: Prefetches transcript/audio availability for episodes
  - Warning: This wipes ALL existing catalog data — podcasts, episodes, subscriptions, briefings, and R2 work products
- **Type-to-confirm**: Input requiring admin to type `SEED` before the confirm button enables
- **Confirm button**: Red/destructive styling, disabled until input matches

### Cancel Confirmation

Cancel uses a simple `AlertDialog` (no type-to-confirm):
- **Title**: "Cancel Catalog Seed"
- **Body**: "This will stop all remaining feed refresh and prefetch processing. Data already inserted will be kept. This cannot be undone."
- **Confirm button**: Red/destructive styling

### Control Buttons

Header area button states:

| Job State | Buttons Shown |
|-----------|---------------|
| No job / complete / failed / cancelled | "Start Seed" (green) |
| Phase 1 active (discovering / upserting) | "Cancel" (red outline, disabled with tooltip: "Phase 1 completes in ~30s") and "Pause" (disabled) |
| `feed_refresh` | "Pause" (amber) + "Cancel" (red outline) |
| `paused` | "Resume" (green) + "Cancel" (red outline) |

### Phase Stepper Updates

Update `getPhaseStatuses()` to handle new statuses. Infer the paused/cancelled phase from counters:
- If `feedsTotal > 0`: Phase 1 is complete, Phases 2/3 were active → show pause/cancel on Phase 2+3
- If `feedsTotal === 0`: Phase 1 was active (shouldn't happen since pause is only during feed_refresh, but defensive)

Extend `PhaseStatus` type to include `"paused" | "cancelled"`. Add corresponding visual treatments to `PhaseIndicator`:
- `paused`: Amber pause icon
- `cancelled`: Neutral X icon (similar to failed but grey/neutral)

Mappings:
- `paused` with `feedsTotal > 0`: `["complete", "paused", "paused"]` — Phase 1 done, 2+3 paused
- `cancelled` with `feedsTotal > 0`: `["complete", "cancelled", "cancelled"]` — Phase 1 done, 2+3 cancelled
- `cancelled` with `feedsTotal === 0`: `["cancelled", "cancelled", "cancelled"]`

### Polling Behavior

- `cancelled`: Stop polling (terminal state)
- `paused`: Poll at reduced frequency (10s instead of 3s) — allows UI to reflect if in-flight messages finish incrementing counters after pause. The existing `isActive` check (`!["complete", "failed"].includes(status)`) already keeps polling for paused/cancelled. Update it to also exclude `"cancelled"`, and compute a dynamic interval: `job?.status === "paused" ? 10000 : 3000`.
- Active states: Continue 3s polling as before

### Cancelled/Paused Summary Banners

- **Paused**: Amber banner with pause icon — "Seed paused. Resume to continue processing." Shows progress so far.
- **Cancelled**: Neutral banner — "Seed cancelled. X podcasts and Y episodes were processed before cancellation."

## Files Modified

- `worker/routes/admin/catalog-seed.ts` — Update active queries, 3 new routes (cancel, pause, resume)
- `worker/queues/feed-refresh.ts` — Job status check in per-podcast loop
- `worker/queues/content-prefetch.ts` — Job status check before processing
- `worker/lib/queue-helpers.ts` — `isSeedJobActive()` helper
- `src/pages/admin/catalog-seed.tsx` — Confirmation dialog, control buttons, phase stepper, polling, banners
- `src/types/admin.ts` — Add `paused` and `cancelled` to CatalogSeedJob status comment
