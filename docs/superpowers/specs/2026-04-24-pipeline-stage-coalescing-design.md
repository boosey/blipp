# Pipeline Upstream Stage Coalescing

**Date:** 2026-04-24
**Status:** Design approved, pending implementation plan

## Problem

The Blipp pipeline orchestrator dispatches one queue message per `(episode, durationTier, voicePresetId)` group during feed refresh. When a popular episode has subscribers spread across multiple voice presets or duration tiers, all of those orchestrator messages arrive at the same cron tick and concurrently traverse the upstream stages.

The upstream stages — **transcription** and **distillation** — are keyed only on `episodeId`, not on `(episode, tier, voice)`. They use idempotent upserts and last-writer-wins R2 writes, but have no concurrency guard. Two or more workers processing the same episode in parallel will each:

1. Miss the R2 cache check at handler entry.
2. Run a full Whisper transcription (paid per-call).
3. Run a full LLM distillation (paid per-call).
4. Idempotently upsert the same `Distillation` row.

The result is correct output but duplicated paid work. At scale — popular podcast, many voice/tier groups, many subscribers — this is wasted spend on every cron tick that introduces a new episode.

The downstream stages (narrative, audio) are already safe: the `Clip` table's `@@unique([episodeId, durationTier, voicePresetId])` constraint matches the orchestrator's dispatch key, so no two messages target the same clip.

## Goal

Eliminate duplicate paid work at transcription and distillation when multiple orchestrator messages for the same episode arrive concurrently, while keeping each queue message independently retryable.

## Non-Goals

- Restructuring the orchestrator's queue topology (an alternative considered and rejected as too invasive).
- Concurrency guards for narrative or audio stages (already deduped by the `Clip` unique constraint).
- Distributed locking via KV, D1, or external services (Postgres row-level CAS is sufficient).

## Approach

Add a CAS (compare-and-set) lock at each affected stage. When a worker arrives at a stage and the R2 cache is cold, it atomically claims the work via a conditional `updateMany`. A second worker that finds the lock held re-queues its message with a short delay, by which time the first worker has finished and the R2 cache is warm — the re-queued worker hits the cache, skips the work, and proceeds to enqueue its own downstream `(tier, voice)` job.

This preserves per-message independence (no message blocks another from making progress) while ensuring only one worker pays for the upstream work per episode.

## Schema Changes

Add two nullable timestamp fields to the existing `Distillation` model in `prisma/schema.prisma`:

```prisma
model Distillation {
  // ...existing fields...
  transcriptionStartedAt  DateTime?
  distillationStartedAt   DateTime?
}
```

These are pure concurrency-control fields. The existing `status` field remains the source of truth for "what work has completed."

A migration is generated via `npm run db:migrate:new distillation_concurrency_locks`. Both fields default to `NULL`, so no backfill is required.

## Lock Acquisition Sequence

Each affected stage handler executes the following sequence. The example uses transcription; distillation is identical with `distillationStartedAt` and a different `requiredStatus`.

1. **R2 cache check** (existing behavior). If the work product already exists in R2, short-circuit, update status if needed, and ack.

2. **Ensure the `Distillation` row exists**:
   ```typescript
   await prisma.distillation.upsert({
     where: { episodeId },
     create: { episodeId, status: "PENDING" },
     update: {},
   });
   ```

3. **Atomic claim** via `updateMany`:
   ```typescript
   const staleAt = new Date(Date.now() - STALE_LOCK_MS);
   const { count } = await prisma.distillation.updateMany({
     where: {
       episodeId,
       status: "PENDING",
       OR: [
         { transcriptionStartedAt: null },
         { transcriptionStartedAt: { lt: staleAt } },
       ],
     },
     data: { transcriptionStartedAt: new Date() },
   });
   ```
   The `status: "PENDING"` clause ensures we don't claim work that's already complete (in which case the second worker should fall through to the post-claim cache re-check on the retry pass).

4. **On `count === 0`**: another active worker holds the lock, OR the work already completed. Call `msg.retry({ delaySeconds: LOCK_RETRY_DELAY_S })` and return. The retried message will hit the R2 cache on its next attempt.

5. **Post-claim R2 re-check**: covers the crash window where a prior worker wrote R2 but did not update `status` before dying. If the cache hits here, skip the work and update status.

6. **Do the work** (Whisper / LLM call), write R2, update `status` to the next state.

7. **On thrown error**: clear the claim field in a `finally` block, then `msg.retry()` with default semantics. This releases the lock so a retry can immediately re-claim rather than waiting for stale-lock recovery.

## Constants

```typescript
const STALE_LOCK_MS = 10 * 60 * 1000;   // 10 minutes
const LOCK_RETRY_DELAY_S = 30;          // 30 seconds
```

**`STALE_LOCK_MS = 10min`** — Whisper transcription on a 60-min episode runs ~2-3 minutes, distillation LLM ~30s. 10 minutes is comfortably past the worst-case healthy completion time, ensuring healthy workers never trip stale recovery while still bounding how long a crashed worker can block.

**`LOCK_RETRY_DELAY_S = 30s`** — Long enough that the first worker is usually finished; short enough that re-queues feel snappy. Briefings are not real-time; a 30-second delay on the duplicate path is invisible to users.

Both constants live in `worker/lib/queue-helpers.ts` alongside the helper. Not environment-configurable — YAGNI.

## Code Organization

Extract a shared helper in `worker/lib/queue-helpers.ts`:

```typescript
type ClaimResult = { claimed: true } | { claimed: false; reason: "held" | "completed" };

async function claimEpisodeStage(args: {
  prisma: PrismaClient;
  episodeId: string;
  lockField: "transcriptionStartedAt" | "distillationStartedAt";
  requiredStatus: DistillationStatus;
  staleMs?: number;
}): Promise<ClaimResult>;
```

Both stage handlers consume this helper. Centralizing the CAS pattern keeps the logic in one place, makes it testable in isolation, and prevents drift if we add a third stage later.

## Files Changed

1. `prisma/schema.prisma` — add two fields to `Distillation`.
2. `prisma/migrations/<timestamp>_distillation_concurrency_locks/migration.sql` — generated.
3. `worker/lib/queue-helpers.ts` — add `claimEpisodeStage` helper and constants.
4. `worker/queues/transcription.ts` — wrap work in claim/release; handle collision via delayed retry.
5. `worker/queues/distillation.ts` — same pattern with `distillationStartedAt`.
6. `worker/queues/__tests__/transcription.test.ts` — concurrency tests.
7. `worker/queues/__tests__/distillation.test.ts` — concurrency tests.
8. `worker/lib/__tests__/queue-helpers.test.ts` — direct tests for `claimEpisodeStage`.
9. `docs/pipeline.md` — document the dedup mechanism.

## Testing

Three concurrency scenarios per stage handler:

- **Lock held**: First worker calls `claimEpisodeStage` → claimed; second worker calls it → not claimed; second worker calls `msg.retry({ delaySeconds: 30 })`. Verify `retry` was called with the correct delay.
- **Stale lock takeover**: A `Distillation` row exists with a `transcriptionStartedAt` older than `STALE_LOCK_MS`. Worker arrives, claim succeeds, work runs.
- **Completion between cache check and claim**: First worker writes R2 and updates status while second worker is between its initial cache check and its claim attempt. Second worker's claim returns `count: 0` (status no longer `PENDING`). Re-queue → on retry, R2 cache hits, work is skipped.

Direct tests for `claimEpisodeStage` cover the same matrix at the helper level, mocking `prisma.distillation.updateMany` to control the claimed count.

## Trade-offs

- **30-second delay on duplicate paths**: acceptable because briefings aren't real-time. If briefing latency becomes a concern, the delay can be reduced.
- **Stale-lock recovery is time-based, not heartbeat-based**: simpler implementation, but a slow worker (very long episode) could theoretically be displaced by a stale-recovery takeover. 10 minutes is a generous upper bound; if this becomes an issue, switch to a heartbeat that updates `transcriptionStartedAt` periodically during long-running work.
- **Helper vs. inlining**: extracting `claimEpisodeStage` adds an indirection but enables shared testing and prevents drift across two near-identical call sites.

## Migration & Rollout

The schema change is purely additive (two nullable columns). CI applies the migration to staging on push, then to prod on production deploy. No backfill needed; existing rows are unaffected.

In-flight messages during deploy: a message processed by old code will not set the lock fields, and a message processed by new code will see `transcriptionStartedAt: null` and proceed normally. No coordination required across versions.
