# Pipeline Stage Coalescing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate paid upstream work (Whisper transcription, distillation LLM) when multiple orchestrator messages for the same episode arrive concurrently, by adding CAS-based locks at the transcription and distillation stages with delayed-retry collision handling.

**Architecture:** Add two nullable timestamp columns to the `Distillation` model (`transcriptionStartedAt`, `distillationStartedAt`). Each stage handler wraps its work in an atomic claim (`prisma.distillation.updateMany` filtered on `status` and stale lock) and releases on completion or error. On claim failure, the worker re-queues itself with a 30-second delay so the second worker hits the R2 cache after the first finishes.

**Tech Stack:** TypeScript, Prisma 7, Cloudflare Workers + Queues, PostgreSQL (Neon + Hyperdrive), Vitest.

**Spec:** `docs/superpowers/specs/2026-04-24-pipeline-stage-coalescing-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `prisma/schema.prisma` | Distillation model | Add 2 nullable timestamp fields |
| `prisma/migrations/<ts>_distillation_concurrency_locks/migration.sql` | DB migration | Generated additive ALTER TABLE |
| `worker/lib/queue-helpers.ts` | Shared queue utilities | Add `claimEpisodeStage` + `releaseEpisodeStage` + constants |
| `worker/lib/__tests__/queue-helpers.test.ts` | Unit test for helpers | New file — covers claim/release scenarios |
| `worker/queues/transcription.ts` | Transcription handler | Wrap work in claim/release; delayed retry on collision |
| `worker/queues/__tests__/transcription.test.ts` | Handler tests | Add 2 collision-handling tests |
| `worker/queues/distillation.ts` | Distillation handler | Same pattern with `distillationStartedAt` |
| `worker/queues/__tests__/distillation.test.ts` | Handler tests | Add 2 collision-handling tests |
| `docs/pipeline.md` | Pipeline architecture docs | Document the dedup mechanism |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma:290-302` (Distillation model)
- Create: `prisma/migrations/<timestamp>_distillation_concurrency_locks/migration.sql` (generated)

- [ ] **Step 1: Add concurrency lock fields to Distillation model**

Modify `prisma/schema.prisma`. The `Distillation` model currently looks like:

```prisma
model Distillation {
  id           String             @id @default(cuid())
  episodeId    String             @unique
  status       DistillationStatus @default(PENDING)
  transcript   String?
  claimsJson   Json?
  errorMessage String?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  clips   Clip[]
}
```

Add two nullable fields:

```prisma
model Distillation {
  id                       String             @id @default(cuid())
  episodeId                String             @unique
  status                   DistillationStatus @default(PENDING)
  transcript               String?
  claimsJson               Json?
  errorMessage             String?
  transcriptionStartedAt   DateTime?
  distillationStartedAt    DateTime?
  createdAt                DateTime           @default(now())
  updatedAt                DateTime           @updatedAt

  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  clips   Clip[]
}
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:migrate:new distillation_concurrency_locks`

This creates `prisma/migrations/<timestamp>_distillation_concurrency_locks/migration.sql`. Inspect the generated file — it should contain:

```sql
-- AlterTable
ALTER TABLE "Distillation" ADD COLUMN     "transcriptionStartedAt" TIMESTAMP(3),
ADD COLUMN     "distillationStartedAt" TIMESTAMP(3);
```

If the generated SQL contains anything else (e.g., DROP statements), STOP and investigate — the schema diff has unintended effects.

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: silent success. The new fields are now available on the typed client.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. No existing code references the new fields yet, so this is just a sanity check.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Distillation concurrency lock fields"
```

---

## Task 2: Build Claim/Release Helpers (TDD)

**Files:**
- Modify: `worker/lib/queue-helpers.ts`
- Create: `worker/lib/__tests__/queue-helpers.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `worker/lib/__tests__/queue-helpers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { claimEpisodeStage, releaseEpisodeStage, STALE_LOCK_MS, LOCK_RETRY_DELAY_S } from "../queue-helpers";

describe("claimEpisodeStage", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      distillation: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };
  });

  it("returns claimed:true when the CAS update affects 1 row", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: true });
    expect(prisma.distillation.updateMany).toHaveBeenCalledWith({
      where: {
        episodeId: "ep1",
        status: "PENDING",
        OR: [
          { transcriptionStartedAt: null },
          { transcriptionStartedAt: { lt: expect.any(Date) } },
        ],
      },
      data: { transcriptionStartedAt: expect.any(Date) },
    });
  });

  it("returns claimed:false reason:held when status matches but lock is fresh", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "PENDING",
      transcriptionStartedAt: new Date(),
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: false, reason: "held" });
  });

  it("returns claimed:false reason:completed when status has advanced", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "TRANSCRIPT_READY",
      transcriptionStartedAt: null,
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: false, reason: "completed" });
  });

  it("uses staleMs override when provided", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 1 });

    await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "distillationStartedAt",
      requiredStatus: "TRANSCRIPT_READY",
      staleMs: 60_000,
    });

    const call = prisma.distillation.updateMany.mock.calls[0][0];
    const staleAt = call.where.OR[1].distillationStartedAt.lt as Date;
    const expectedFloor = Date.now() - 60_000 - 1000;
    const expectedCeil = Date.now() - 60_000 + 1000;
    expect(staleAt.getTime()).toBeGreaterThanOrEqual(expectedFloor);
    expect(staleAt.getTime()).toBeLessThanOrEqual(expectedCeil);
  });

  it("exports STALE_LOCK_MS = 10 minutes and LOCK_RETRY_DELAY_S = 30s", () => {
    expect(STALE_LOCK_MS).toBe(10 * 60 * 1000);
    expect(LOCK_RETRY_DELAY_S).toBe(30);
  });
});

describe("releaseEpisodeStage", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      distillation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  it("clears the named lock field for the episode", async () => {
    await releaseEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
    });

    expect(prisma.distillation.updateMany).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      data: { transcriptionStartedAt: null },
    });
  });

  it("swallows DB errors silently", async () => {
    prisma.distillation.updateMany.mockRejectedValue(new Error("connection lost"));
    await expect(
      releaseEpisodeStage({
        prisma,
        episodeId: "ep1",
        lockField: "distillationStartedAt",
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/queue-helpers.test.ts`
Expected: FAIL — `claimEpisodeStage`, `releaseEpisodeStage`, `STALE_LOCK_MS`, `LOCK_RETRY_DELAY_S` are not exported.

- [ ] **Step 3: Implement helpers**

Add to the END of `worker/lib/queue-helpers.ts` (after the existing `sendBatchedFeedRefresh` function):

```typescript
/**
 * Time after which a stale transcription/distillation lock is considered
 * abandoned (presumed crashed worker) and may be claimed by a new worker.
 *
 * 10 minutes is comfortably past worst-case healthy completion (Whisper on a
 * 60-min episode runs ~2-3 min; distillation LLM ~30s).
 */
export const STALE_LOCK_MS = 10 * 60 * 1000;

/**
 * Delay applied when a worker re-queues itself because another worker holds
 * the upstream stage lock. By the time the message is redelivered, the first
 * worker has typically finished and the R2 cache is warm.
 */
export const LOCK_RETRY_DELAY_S = 30;

export type EpisodeStageLockField = "transcriptionStartedAt" | "distillationStartedAt";
export type EpisodeStageRequiredStatus = "PENDING" | "TRANSCRIPT_READY";

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; reason: "held" | "completed" };

/**
 * Atomically claim an upstream pipeline stage for an episode using
 * compare-and-set on the Distillation table. The claim succeeds only if the
 * row's status matches `requiredStatus` AND the lock field is null or stale.
 *
 * Callers must ensure a Distillation row already exists for the episode
 * (e.g., via an upsert) before calling this.
 */
export async function claimEpisodeStage(args: {
  prisma: any;
  episodeId: string;
  lockField: EpisodeStageLockField;
  requiredStatus: EpisodeStageRequiredStatus;
  staleMs?: number;
}): Promise<ClaimResult> {
  const staleAt = new Date(Date.now() - (args.staleMs ?? STALE_LOCK_MS));

  const result = await args.prisma.distillation.updateMany({
    where: {
      episodeId: args.episodeId,
      status: args.requiredStatus,
      OR: [
        { [args.lockField]: null },
        { [args.lockField]: { lt: staleAt } },
      ],
    },
    data: { [args.lockField]: new Date() },
  });

  if (result.count === 1) return { claimed: true };

  const row = await args.prisma.distillation.findUnique({
    where: { episodeId: args.episodeId },
    select: { status: true, [args.lockField]: true },
  });

  if (row && row.status !== args.requiredStatus) {
    return { claimed: false, reason: "completed" };
  }
  return { claimed: false, reason: "held" };
}

/**
 * Release a previously-acquired stage lock by clearing the named field.
 * Errors are swallowed — best-effort cleanup; stale recovery handles
 * orphaned locks if this fails.
 */
export async function releaseEpisodeStage(args: {
  prisma: any;
  episodeId: string;
  lockField: EpisodeStageLockField;
}): Promise<void> {
  try {
    await args.prisma.distillation.updateMany({
      where: { episodeId: args.episodeId },
      data: { [args.lockField]: null },
    });
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/queue-helpers.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/queue-helpers.ts worker/lib/__tests__/queue-helpers.test.ts
git commit -m "feat(queue): add claimEpisodeStage CAS lock helper"
```

---

## Task 3: Wire Transcription Handler

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/__tests__/transcription.test.ts`

- [ ] **Step 1: Write failing tests for collision handling**

Open `worker/queues/__tests__/transcription.test.ts`. At the bottom of the existing `describe("handleTranscription", ...)` block, add the following two tests. Place them just before the closing `});` of the describe block. (Match the existing style — `JOB`, `EPISODE`, `PODCAST` constants and `createMsg`/`createBatch` helpers are already defined in the file.)

```typescript
  it("re-queues with 30s delay when lock is held by another worker", async () => {
    // Job + cancellation guard pass-through
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue(JOB);
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    // R2 cache miss
    (env.R2.head as any).mockResolvedValue(null);
    // Distillation upsert succeeds
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    // CAS claim: 0 rows updated, current row shows fresh lock
    mockPrisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      status: "PENDING",
      transcriptionStartedAt: new Date(),
    });

    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    const batch = createBatch([msg]);

    await handleTranscription(batch, env, ctx);

    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(msg.ack).not.toHaveBeenCalled();
    // Did not run STT
    expect(mockTranscribeChunked).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it("re-queues with delay when status has already advanced past PENDING", async () => {
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue(JOB);
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    (env.R2.head as any).mockResolvedValue(null); // initial cache miss
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    // CAS claim returns "completed" — status already TRANSCRIPT_READY
    mockPrisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      status: "TRANSCRIPT_READY",
      transcriptionStartedAt: null,
    });

    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    const batch = createBatch([msg]);

    await handleTranscription(batch, env, ctx);

    // Retry with delay — on next attempt the R2 cache will hit and the
    // handler will short-circuit at the top-of-handler cache check.
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(msg.ack).not.toHaveBeenCalled();
    expect(mockTranscribeChunked).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts -t "re-queues with 30s delay"`
Expected: FAIL — `msg.retry` not called with delay (or current code still attempts STT).

- [ ] **Step 3: Wire the handler to use the lock helpers**

Edit `worker/queues/transcription.ts`. At the top of the file, add to the imports for queue-helpers (currently importing only `checkStageEnabled`):

```typescript
import { checkStageEnabled, claimEpisodeStage, releaseEpisodeStage, LOCK_RETRY_DELAY_S } from "../lib/queue-helpers";
```

Then locate the block starting at line 142 (`// Load episode + podcast for transcript sources`). This is immediately after the cache-hit handling block (which ends with `continue;` at line 140). Insert the claim logic BEFORE the existing episode-load:

```typescript
        // Cache miss — atomically claim this episode for transcription.
        // Multiple orchestrator messages for the same episode (different
        // tier/voice groups) can arrive concurrently; only one worker should
        // pay for Whisper.
        await prisma.distillation.upsert({
          where: { episodeId },
          create: { episodeId, status: "PENDING" },
          update: {},
        });

        const claim = await claimEpisodeStage({
          prisma,
          episodeId,
          lockField: "transcriptionStartedAt",
          requiredStatus: "PENDING",
        });

        if (!claim.claimed) {
          // Another worker holds the lock or the work already completed.
          // Re-queue with delay; on retry the R2 cache will be warm.
          await writeEvent(prisma, step.id, "INFO", `Transcription deferred — ${claim.reason} by another worker`, { reason: claim.reason });
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: false,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
              errorMessage: `coalesce_${claim.reason}`,
            },
          });
          msg.retry({ delaySeconds: LOCK_RETRY_DELAY_S });
          continue;
        }

        // Post-claim cache re-check: covers the crash window where a prior
        // worker wrote R2 but did not advance status before dying.
        const postClaimCacheHit = await env.R2.head(transcriptR2Key);
        if (postClaimCacheHit) {
          log.debug("post_claim_cache_hit", { episodeId });
          await writeEvent(prisma, step.id, "INFO", "Post-claim cache hit — transcript exists in R2");

          await prisma.workProduct.upsert({
            where: { r2Key: transcriptR2Key },
            update: {},
            create: { type: "TRANSCRIPT", episodeId, r2Key: transcriptR2Key, sizeBytes: postClaimCacheHit.size },
          });

          const distillation = await prisma.distillation.upsert({
            where: { episodeId },
            update: { status: "TRANSCRIPT_READY", errorMessage: null, transcriptionStartedAt: null },
            create: { episodeId, status: "TRANSCRIPT_READY" },
          });

          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          });

          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { distillationId: distillation.id },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "TRANSCRIPTION",
            correlationId,
          });

          msg.ack();
          continue;
        }
```

Then at the success path (around line 360, just after `await writeEvent(prisma, step.id, "INFO", "Saved transcript to R2", ...)`), modify the existing distillation upsert to ALSO clear the lock field:

```typescript
        // Upsert Distillation status (transcript content lives in R2 only).
        // Clear the transcription lock — this work is done.
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "TRANSCRIPT_READY", errorMessage: null, transcriptionStartedAt: null },
          create: { episodeId, status: "TRANSCRIPT_READY" },
        });
```

In the `catch (err)` block (around line 394), add a lock release at the top, before any other error handling:

```typescript
      } catch (err) {
        // Release the transcription lock so a retry can immediately re-claim
        // rather than waiting for stale-lock recovery.
        await releaseEpisodeStage({ prisma, episodeId, lockField: "transcriptionStartedAt" });

        const errorMessage = err instanceof Error ? err.message : String(err);
        // ...rest of existing catch block unchanged
```

- [ ] **Step 4: Run all transcription tests**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: PASS — all existing tests still green, plus the two new collision tests pass.

If any pre-existing test fails because the mock prisma doesn't return a value for `distillation.upsert` or `distillation.updateMany`, set sensible defaults in that test's setup:

```typescript
mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
mockPrisma.distillation.updateMany.mockResolvedValue({ count: 1 });
```

The existing test setup already does `mockReset()` on all methods in `beforeEach`. Add these defaults next to the other defaults at the bottom of `beforeEach` (around line 234, after the `resolveModelChain` reset).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat(queue): coalesce concurrent transcription via CAS lock"
```

---

## Task 4: Wire Distillation Handler

**Files:**
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/__tests__/distillation.test.ts`

- [ ] **Step 1: Write failing tests for collision handling**

Open `worker/queues/__tests__/distillation.test.ts`. Match the existing test style — read the top of the file to see the constants and helpers already defined. Add two new tests inside the existing top-level `describe("handleDistillation", ...)` block:

```typescript
  it("re-queues with 30s delay when distillation lock is held", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({ id: "job1", requestId: "req1" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({ status: "PROCESSING" });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    // R2 cache miss
    (env.R2.head as any).mockResolvedValue(null);
    // Transcript exists in R2 (so we don't bail before the claim)
    // R2.get is mocked to return decoded transcript via getWorkProduct mock — match existing test pattern
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1" });
    // CAS claim: 0 rows updated, lock held
    mockPrisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      status: "TRANSCRIPT_READY",
      distillationStartedAt: new Date(),
    });

    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    const batch = createBatch([msg]);

    await handleDistillation(batch, env, ctx);

    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("re-queues with delay when distillation status has already advanced past TRANSCRIPT_READY", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({ id: "job1", requestId: "req1" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({ status: "PROCESSING" });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    (env.R2.head as any).mockResolvedValue(null); // initial cache miss
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1" });
    mockPrisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      status: "COMPLETED",
      distillationStartedAt: null,
    });

    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    const batch = createBatch([msg]);

    await handleDistillation(batch, env, ctx);

    // Retry — on next attempt the CLAIMS R2 cache will hit at top of handler.
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(msg.ack).not.toHaveBeenCalled();
  });
```

If `createMsg`, `createBatch`, or the env/ctx/handleDistillation imports don't exist in this test file with those exact names, mirror the patterns from `transcription.test.ts:158-198` — they should already exist in the distillation test file too. Read the top 200 lines of `distillation.test.ts` first to confirm the import names and test setup before adding these tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts -t "re-queues with 30s delay when distillation lock"`
Expected: FAIL.

- [ ] **Step 3: Wire the handler to use the lock helpers**

Edit `worker/queues/distillation.ts`. Update the queue-helpers import at the top:

```typescript
import { checkStageEnabled, claimEpisodeStage, releaseEpisodeStage, LOCK_RETRY_DELAY_S } from "./../lib/queue-helpers";
```

(Use `../lib/queue-helpers` if the file currently has the same relative-path style as transcription.ts.)

Locate the block at lines 138-149 (loading transcript from R2 and creating the existing Distillation upsert). Currently the flow is:
1. R2 cache check for CLAIMS → ack on hit (lines 95-136)
2. Load transcript from R2 (lines 138-148)
3. Upsert Distillation to EXTRACTING_CLAIMS (lines 151-155)
4. Run distillation (lines 157+)

We need to insert the claim BEFORE the upsert-to-EXTRACTING_CLAIMS, and rely on the existing transcript load to fail-fast if transcript is missing.

Replace the existing upsert at lines 151-155:

```typescript
        // Ensure Distillation record exists, update status
        const existing = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "EXTRACTING_CLAIMS", errorMessage: null },
          create: { episodeId, status: "EXTRACTING_CLAIMS" },
        });
```

with this expanded block:

```typescript
        // Ensure Distillation row exists so we can CAS-claim it.
        await prisma.distillation.upsert({
          where: { episodeId },
          create: { episodeId, status: "TRANSCRIPT_READY" },
          update: {},
        });

        // Atomically claim distillation work for this episode.
        const claim = await claimEpisodeStage({
          prisma,
          episodeId,
          lockField: "distillationStartedAt",
          requiredStatus: "TRANSCRIPT_READY",
        });

        if (!claim.claimed) {
          await writeEvent(prisma, stepId, "INFO", `Distillation deferred — ${claim.reason} by another worker`, { reason: claim.reason });
          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "SKIPPED",
              cached: false,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
              errorMessage: `coalesce_${claim.reason}`,
            },
          });
          msg.retry({ delaySeconds: LOCK_RETRY_DELAY_S });
          continue;
        }

        // Post-claim cache re-check: covers crash window after a prior worker
        // wrote claims to R2 but did not update status before dying.
        const postClaimCacheHit = await env.R2.head(claimsR2Key);
        if (postClaimCacheHit) {
          log.debug("post_claim_cache_hit", { episodeId });
          await writeEvent(prisma, stepId, "INFO", "Post-claim cache hit — claims exist in R2");

          await prisma.workProduct.upsert({
            where: { r2Key: claimsR2Key },
            update: {},
            create: { type: "CLAIMS", episodeId, r2Key: claimsR2Key, sizeBytes: postClaimCacheHit.size },
          });

          const existingForCache = await prisma.distillation.findUnique({ where: { episodeId } });
          if (existingForCache) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { distillationId: existingForCache.id },
            });
          }

          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
            },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "DISTILLATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Move status forward — we own the work.
        const existing = await prisma.distillation.update({
          where: { episodeId },
          data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
        });
```

Then at the success path (around line 262, the `prisma.distillation.update` that sets `status: "COMPLETED"`), modify it to also clear the lock:

```typescript
        // Mark distillation as completed and release the lock.
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "COMPLETED", distillationStartedAt: null },
        });
```

In the `catch (err)` block (around line 336), add a lock release at the top:

```typescript
      } catch (err) {
        // Release the distillation lock so a retry can immediately re-claim.
        await releaseEpisodeStage({ prisma, episodeId, lockField: "distillationStartedAt" });

        const errorMessage =
          err instanceof Error ? err.message : String(err);
        // ...rest of existing catch block unchanged
```

- [ ] **Step 4: Run all distillation tests**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: PASS — all existing tests still green, plus the two new collision tests pass.

As with transcription, you may need to add defaults to the test's `beforeEach`:

```typescript
mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1" });
mockPrisma.distillation.updateMany.mockResolvedValue({ count: 1 });
mockPrisma.distillation.update.mockResolvedValue({ id: "dist1" });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run full worker test suite**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`
Expected: PASS — full worker test suite green.

- [ ] **Step 7: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "feat(queue): coalesce concurrent distillation via CAS lock"
```

---

## Task 5: Document the Dedup Mechanism

**Files:**
- Modify: `docs/pipeline.md`

- [ ] **Step 1: Read existing pipeline doc to find the right section**

Run: `grep -n "dedup\|cache check\|R2.head\|coalesc" docs/pipeline.md`

Identify the existing section that discusses caching / WorkProduct keys (likely around the WorkProduct or pipeline-stages section).

- [ ] **Step 2: Add a new subsection on stage coalescing**

Append to `docs/pipeline.md` (or insert under the existing "Caching / dedup" section if one exists). Add this content:

```markdown
## Upstream Stage Coalescing

When a popular episode is delivered to subscribers across multiple voice presets
or duration tiers, the orchestrator dispatches one queue message per
`(episode, durationTier, voicePresetId)` group. All such messages traverse the
same upstream stages — transcription and distillation — which are keyed only on
`episodeId`. Without coordination, every message would pay for its own Whisper
transcription and distillation LLM call.

To prevent this, the transcription and distillation handlers each acquire a
CAS-based lock on the `Distillation` row before doing paid work.

**Lock fields:** `Distillation.transcriptionStartedAt`, `Distillation.distillationStartedAt`.

**Acquisition:** `claimEpisodeStage` in `worker/lib/queue-helpers.ts` runs an
atomic `updateMany` filtered on the row's `status` and an `OR(field IS NULL,
field < staleThreshold)` clause. Exactly one concurrent worker observes
`count: 1`; the others observe `count: 0`.

**Collision behavior:** Workers that lose the race call
`msg.retry({ delaySeconds: 30 })`. By the time the message is redelivered, the
winning worker has typically finished and written R2; the retried worker hits
the cache check at the top of the handler and skips paid work.

**Stale recovery:** If the winning worker crashes mid-stage, its lock becomes
eligible for takeover after `STALE_LOCK_MS` (10 minutes), generously past
worst-case healthy completion.

**Crash window:** A post-claim R2 re-check covers the case where a prior worker
wrote R2 but died before updating `status`.

**Downstream stages** (narrative, audio) are already deduped by the `Clip`
table's `@@unique([episodeId, durationTier, voicePresetId])` constraint, which
matches the orchestrator's dispatch key — no concurrent producers are possible
for the same clip.
```

- [ ] **Step 3: Commit**

```bash
git add docs/pipeline.md
git commit -m "docs: document upstream stage coalescing"
```

---

## Final Verification

- [ ] **Step 1: Full test suite**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npm test`
Expected: ALL TESTS PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Migration status check (staging)**

Run: `npm run db:migrate:status:staging`
Expected: shows the new migration as pending (will be applied by CI on push).

- [ ] **Step 4: Confirm no destructive operations in the migration**

Run: `cat prisma/migrations/*distillation_concurrency_locks*/migration.sql`
Expected: only `ALTER TABLE ... ADD COLUMN` statements. NO `DROP`, `RENAME`, or data-altering operations.

- [ ] **Step 5: Sanity-check the diff**

Run: `git log --oneline main..HEAD` — should show 5 commits:
1. `feat(db): add Distillation concurrency lock fields`
2. `feat(queue): add claimEpisodeStage CAS lock helper`
3. `feat(queue): coalesce concurrent transcription via CAS lock`
4. `feat(queue): coalesce concurrent distillation via CAS lock`
5. `docs: document upstream stage coalescing`

- [ ] **Step 6: Done**

Plan complete. CI will apply the migration to staging on push, then to production on the production deploy.
