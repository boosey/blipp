# Demand-Driven Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the auto-chaining pipeline to demand-driven with a push-based orchestrator, split transcription from distillation, and add Request Manager + Job Manager admin UI.

**Architecture:** New ORCHESTRATOR_QUEUE + TRANSCRIPTION_QUEUE. Stage handlers report completion back to orchestrator. BriefingRequest model tracks user requests. Admin gets a dedicated /admin/requests page.

**Tech Stack:** Cloudflare Workers, Queues, Prisma 7, Hono, React 19, shadcn/ui, Vitest

---

## Execution Strategy: Agent Teams

Per CLAUDE.md, use Agent Teams with shared-contracts-first:

- **Phase 1 (blocking):** Shared contracts — schema, types, config, mocks
- **Phase 2 (parallel fan-out):**
  - Agent A: Backend queue handlers (transcription, orchestrator, modified distillation/clip-gen/feed-refresh)
  - Agent B: Backend API routes (request manager routes, modified briefings/generate, test-briefing endpoint)
  - Agent C: Frontend (requests page, pipeline enhancements, configuration, nav/routing)

---

## Phase 1: Shared Contracts (Blocking)

### Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add BriefingRequest model**

After the Briefing model (line 199), add:

```prisma
// ── Briefing Requests (Demand-Driven Pipeline) ──

model BriefingRequest {
  id            String               @id @default(cuid())
  userId        String
  status        BriefingRequestStatus @default(PENDING)
  targetMinutes Int
  podcastIds    String[]
  isTest        Boolean              @default(false)
  briefingId    String?              @unique
  errorMessage  String?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  briefing Briefing? @relation(fields: [briefingId], references: [id])
}

enum BriefingRequestStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

**Step 2: Add requestId and parentJobId to PipelineJob**

In the PipelineJob model (after line 217, before `createdAt`):

```prisma
  requestId    String?   // links to BriefingRequest
  parentJobId  String?   // for job trees
```

**Step 3: Add TRANSCRIPT_READY to DistillationStatus**

In the DistillationStatus enum (line 114-120), add after FETCHING_TRANSCRIPT:

```prisma
enum DistillationStatus {
  PENDING
  FETCHING_TRANSCRIPT
  TRANSCRIPT_READY
  EXTRACTING_CLAIMS
  COMPLETED
  FAILED
}
```

**Step 4: Add relations to User and Briefing models**

In User model (after line 46, `briefings` relation), add:

```prisma
  briefingRequests BriefingRequest[]
```

In Briefing model (after line 180, `segments` relation), add:

```prisma
  request BriefingRequest?
```

**Step 5: Run prisma generate**

Run: `npx prisma generate`
Expected: Success, generated client updated.

**Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add BriefingRequest model, TRANSCRIPT_READY status, PipelineJob request fields"
```

---

### Task 2: Queue Bindings & Env Type

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `worker/types.ts`

**Step 1: Add queue producers in wrangler.jsonc**

In the `producers` array (after line 29), add:

```jsonc
{ "binding": "TRANSCRIPTION_QUEUE", "queue": "transcription" },
{ "binding": "ORCHESTRATOR_QUEUE", "queue": "orchestrator" }
```

**Step 2: Add queue consumers in wrangler.jsonc**

In the `consumers` array (after line 35), add:

```jsonc
{ "queue": "transcription", "max_batch_size": 5, "max_retries": 3 },
{ "queue": "orchestrator", "max_batch_size": 10, "max_retries": 3 }
```

**Step 3: Add to Env type in worker/types.ts**

After line 39 (before the closing `}`), add:

```typescript
  /** Queue: fetches episode transcripts from URLs */
  TRANSCRIPTION_QUEUE: Queue;
  /** Queue: orchestrates demand-driven pipeline stages for briefing requests */
  ORCHESTRATOR_QUEUE: Queue;
```

**Step 4: Commit**

```bash
git add wrangler.jsonc worker/types.ts
git commit -m "config: add TRANSCRIPTION_QUEUE and ORCHESTRATOR_QUEUE bindings"
```

---

### Task 3: Shared Admin Types

**Files:**
- Modify: `src/types/admin.ts`

**Step 1: Add BriefingRequest types**

Add after the PipelineTriggerResult interface (line 423):

```typescript
// ── Briefing Requests ──

export interface BriefingRequest {
  id: string;
  userId: string;
  status: BriefingRequestStatus;
  targetMinutes: number;
  podcastIds: string[];
  isTest: boolean;
  briefingId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields from API
  userName?: string;
  userEmail?: string;
  episodeProgress?: EpisodeProgress[];
}

export type BriefingRequestStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface EpisodeProgress {
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  transcription: StageProgress;
  distillation: StageProgress;
  clipGeneration: StageProgress;
}

export interface StageProgress {
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  durationMs?: number;
  errorMessage?: string;
}
```

**Step 2: Commit**

```bash
git add src/types/admin.ts
git commit -m "types: add BriefingRequest and EpisodeProgress shared types"
```

---

### Task 4: Update Test Mocks

**Files:**
- Modify: `tests/helpers/mocks.ts`

**Step 1: Add briefingRequest model to createMockPrisma()**

After line 36 (`pipelineJob: modelMethods(),`), add:

```typescript
    briefingRequest: modelMethods(),
```

**Step 2: Add new queues to createMockEnv()**

After line 70 (`BRIEFING_ASSEMBLY_QUEUE`), add:

```typescript
    TRANSCRIPTION_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    ORCHESTRATOR_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
```

**Step 3: Commit**

```bash
git add tests/helpers/mocks.ts
git commit -m "test: add BriefingRequest model and new queues to mock factories"
```

---

## Phase 2A: Backend Queue Handlers (Agent A)

### Task 5: Transcription Queue Handler

**Files:**
- Create: `worker/queues/transcription.ts`
- Test: `worker/queues/__tests__/transcription.test.ts`

**Step 1: Write tests**

```typescript
// worker/queues/__tests__/transcription.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTranscription } from "../transcription";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

// Mock dependencies
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));
vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

describe("handleTranscription", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let env: ReturnType<typeof createMockEnv>;
  let ctx: { waitUntil: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createMockPrisma();
    env = createMockEnv();
    ctx = { waitUntil: vi.fn() };
    vi.mocked(
      (await import("../../lib/db")).createPrismaClient
    ).mockReturnValue(prisma as any);
    vi.clearAllMocks();
  });

  function makeBatch(
    bodies: Array<{ episodeId: string; transcriptUrl: string; requestId?: string; type?: string }>
  ) {
    return {
      queue: "transcription",
      messages: bodies.map((body) => ({
        body,
        ack: vi.fn(),
        retry: vi.fn(),
      })),
    } as unknown as MessageBatch<any>;
  }

  it("fetches transcript and stores in distillation record", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("This is the transcript text."),
    });
    prisma.distillation.findUnique.mockResolvedValue(null);
    prisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
    prisma.pipelineJob.create.mockResolvedValue({ id: "job-1" });

    const batch = makeBatch([{ episodeId: "ep-1", transcriptUrl: "https://example.com/t.vtt" }]);
    await handleTranscription(batch, env, ctx as any);

    expect(prisma.distillation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { episodeId: "ep-1" },
        create: expect.objectContaining({ status: "FETCHING_TRANSCRIPT" }),
      })
    );
    // Second update sets transcript and TRANSCRIPT_READY
    expect(prisma.distillation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "TRANSCRIPT_READY",
          transcript: "This is the transcript text.",
        }),
      })
    );
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it("reports back to orchestrator when requestId is present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("transcript"),
    });
    prisma.distillation.findUnique.mockResolvedValue(null);
    prisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
    prisma.pipelineJob.create.mockResolvedValue({ id: "job-1" });

    const batch = makeBatch([{
      episodeId: "ep-1",
      transcriptUrl: "https://example.com/t.vtt",
      requestId: "req-1",
    }]);
    await handleTranscription(batch, env, ctx as any);

    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "stage-complete",
      stage: 2,
      episodeId: "ep-1",
    });
  });

  it("skips if transcript already fetched (TRANSCRIPT_READY or later)", async () => {
    prisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "TRANSCRIPT_READY",
      transcript: "already fetched",
    });

    const batch = makeBatch([{ episodeId: "ep-1", transcriptUrl: "https://example.com/t.vtt" }]);
    await handleTranscription(batch, env, ctx as any);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it("respects stage-enabled gate, bypassed by type: manual", async () => {
    const { getConfig } = await import("../../lib/config");
    vi.mocked(getConfig).mockResolvedValue(false);

    const batch = makeBatch([{ episodeId: "ep-1", transcriptUrl: "https://example.com/t.vtt" }]);
    await handleTranscription(batch, env, ctx as any);

    // All messages acked without work
    expect(prisma.distillation.upsert).not.toHaveBeenCalled();
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: FAIL — module not found

**Step 3: Implement handler**

```typescript
// worker/queues/transcription.ts
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import type { Env } from "../types";

interface TranscriptionMessage {
  episodeId: string;
  transcriptUrl: string;
  requestId?: string;
  type?: "manual";
}

const SKIP_STATUSES = new Set(["TRANSCRIPT_READY", "EXTRACTING_CLAIMS", "COMPLETED"]);

export async function handleTranscription(
  batch: MessageBatch<TranscriptionMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(prisma, "pipeline.stage.2.enabled", true);
      if (!stageEnabled) {
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { episodeId, transcriptUrl, requestId } = msg.body;

      try {
        // Idempotency: skip if transcript already fetched
        const existing = await prisma.distillation.findUnique({
          where: { episodeId },
        });
        if (existing && SKIP_STATUSES.has(existing.status)) {
          // Still report back if orchestrated
          if (requestId) {
            await env.ORCHESTRATOR_QUEUE.send({
              requestId, action: "stage-complete", stage: 2, episodeId,
            });
          }
          msg.ack();
          continue;
        }

        // Create/update distillation record
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "FETCHING_TRANSCRIPT", errorMessage: null },
          create: { episodeId, status: "FETCHING_TRANSCRIPT" },
        });

        // Create PipelineJob for observability
        await prisma.pipelineJob.create({
          data: {
            type: "TRANSCRIPTION",
            status: "IN_PROGRESS",
            entityId: episodeId,
            entityType: "episode",
            stage: 2,
            requestId: requestId ?? null,
            startedAt: new Date(),
          },
        });

        // Fetch transcript
        const response = await fetch(transcriptUrl);
        const transcript = await response.text();

        // Store transcript
        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { status: "TRANSCRIPT_READY", transcript },
        });

        // Report back to orchestrator
        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId, action: "stage-complete", stage: 2, episodeId,
          });
        }

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(() => {});
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: add transcription queue handler (stage 2 split)"
```

---

### Task 6: Modify Distillation Handler

**Files:**
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/__tests__/distillation.test.ts` (if exists, otherwise create)

**Step 1: Remove transcript fetching from distillation.ts**

The handler should:
- Remove `transcriptUrl` from the message interface (no longer needed)
- Add `requestId?: string` to the message interface
- Load existing Distillation record and read `transcript` field
- If no transcript → fail with "No transcript available"
- Keep claim extraction logic as-is
- After completion, report back to orchestrator if `requestId` present
- Update config key from `pipeline.stage.2.enabled` to `pipeline.stage.3.enabled` (distillation is now stage 3)

Key changes to `worker/queues/distillation.ts`:

```typescript
interface DistillationMessage {
  episodeId: string;
  requestId?: string;
  type?: "manual";
}
```

Replace transcript fetching (lines 64-78) with:

```typescript
// Load existing distillation with transcript
const distillation = await prisma.distillation.findUnique({
  where: { episodeId },
});

if (!distillation?.transcript) {
  throw new Error("No transcript available — run transcription first");
}

// Update status to EXTRACTING_CLAIMS
await prisma.distillation.update({
  where: { id: distillation.id },
  data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
});
```

After marking COMPLETED, add orchestrator callback:

```typescript
if (requestId) {
  await env.ORCHESTRATOR_QUEUE.send({
    requestId, action: "stage-complete", stage: 3, episodeId,
  });
}
```

Change stage gate config key from `pipeline.stage.2.enabled` to `pipeline.stage.3.enabled`.

**Step 2: Update tests**

**Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "refactor: distillation handler expects transcript present, reports to orchestrator"
```

---

### Task 7: Modify Clip Generation Handler

**Files:**
- Modify: `worker/queues/clip-generation.ts`

**Step 1: Add requestId to message interface and orchestrator callback**

In `worker/queues/clip-generation.ts`:

Add `requestId?: string` to ClipGenerationMessage interface (line 11-17).

After line 112 (`msg.ack()`), add:

```typescript
// Report back to orchestrator if this is part of a request
const { requestId } = msg.body;
if (requestId) {
  await env.ORCHESTRATOR_QUEUE.send({
    requestId, action: "stage-complete", stage: 4, episodeId,
  });
}
```

Change stage gate config key from `pipeline.stage.3.enabled` to `pipeline.stage.4.enabled`.

**Step 2: Commit**

```bash
git add worker/queues/clip-generation.ts
git commit -m "feat: clip generation reports to orchestrator, stage renumbered to 4"
```

---

### Task 8: Orchestrator Queue Handler

**Files:**
- Create: `worker/queues/orchestrator.ts`
- Test: `worker/queues/__tests__/orchestrator.test.ts`

**Step 1: Write tests**

Test cases:
1. "evaluate" action with no episodes needing work → assembles briefing immediately
2. "evaluate" action with episodes needing transcription → dispatches to TRANSCRIPTION_QUEUE
3. "evaluate" action with episodes needing distillation (transcript ready) → dispatches to DISTILLATION_QUEUE
4. "evaluate" action with episodes needing clips → dispatches to CLIP_GENERATION_QUEUE
5. "stage-complete" with all episodes done → assembles briefing
6. "stage-complete" with more work needed → dispatches next stage
7. Request marked FAILED if no eligible episodes found

**Step 2: Implement orchestrator**

```typescript
// worker/queues/orchestrator.ts
import { createPrismaClient } from "../lib/db";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
import { allocateWordBudget } from "../lib/time-fitting";
import type { Env } from "../types";

interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "stage-complete";
  stage?: number;
  episodeId?: string;
}

export async function handleOrchestrator(
  batch: MessageBatch<OrchestratorMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { requestId } = msg.body;

      try {
        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
        });
        if (!request || request.status === "COMPLETED" || request.status === "FAILED") {
          msg.ack();
          continue;
        }

        // Update to PROCESSING if still PENDING
        if (request.status === "PENDING") {
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "PROCESSING" },
          });
        }

        // Resolve target episodes: latest per podcast
        const episodes = [];
        for (const podcastId of request.podcastIds) {
          const episode = await prisma.episode.findFirst({
            where: { podcastId },
            orderBy: { publishedAt: "desc" },
            include: {
              distillation: true,
              clips: true,
            },
          });
          if (episode) episodes.push(episode);
        }

        if (episodes.length === 0) {
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage: "No episodes found for selected podcasts" },
          });
          msg.ack();
          continue;
        }

        // Check what each episode needs
        let allReady = true;

        for (const episode of episodes) {
          const dist = episode.distillation;

          // Need transcription?
          if (!dist || dist.status === "PENDING" || dist.status === "FAILED") {
            if (episode.transcriptUrl) {
              allReady = false;
              await env.TRANSCRIPTION_QUEUE.send({
                episodeId: episode.id,
                transcriptUrl: episode.transcriptUrl,
                requestId,
              });
            }
            continue;
          }

          // Need distillation? (transcript ready but claims not extracted)
          if (dist.status === "TRANSCRIPT_READY") {
            allReady = false;
            await env.DISTILLATION_QUEUE.send({
              episodeId: episode.id,
              requestId,
            });
            continue;
          }

          // Distillation in progress?
          if (dist.status === "FETCHING_TRANSCRIPT" || dist.status === "EXTRACTING_CLAIMS") {
            allReady = false;
            continue;
          }

          // Distillation complete — need clips?
          if (dist.status === "COMPLETED") {
            // Use allocateWordBudget to determine needed tier, simplified:
            // For now check if any clip exists for this episode
            const hasClip = episode.clips.some((c: any) => c.status === "COMPLETED");
            if (!hasClip && dist.claimsJson) {
              allReady = false;
              await env.CLIP_GENERATION_QUEUE.send({
                episodeId: episode.id,
                distillationId: dist.id,
                durationTier: 3, // default tier, orchestrator can be smarter later
                claims: dist.claimsJson,
                requestId,
              });
            }
          }
        }

        if (allReady) {
          // Assemble the briefing
          await assembleBriefing(prisma, env, request, episodes);
        }

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.briefingRequest
          .update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch(() => {});
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

async function assembleBriefing(
  prisma: any,
  env: Env,
  request: any,
  episodes: any[]
): Promise<void> {
  // Create Briefing record
  const briefing = await prisma.briefing.create({
    data: {
      userId: request.userId,
      targetMinutes: request.targetMinutes,
      status: "ASSEMBLING",
    },
  });

  // Allocate time budget
  const readyEpisodes = episodes.filter(
    (ep: any) => ep.distillation?.status === "COMPLETED" && ep.clips.some((c: any) => c.status === "COMPLETED")
  );

  const episodeInputs = readyEpisodes.map((ep: any) => ({
    transcriptWordCount: ep.distillation.transcript
      ? ep.distillation.transcript.split(/\s+/).length
      : 1000,
  }));

  const allocations = allocateWordBudget(episodeInputs, request.targetMinutes);

  // Gather clips
  const clipBuffers: ArrayBuffer[] = [];
  for (const alloc of allocations) {
    const ep = readyEpisodes[alloc.index];
    const cached = await getClip(env.R2, ep.id, alloc.durationTier);
    if (cached) clipBuffers.push(cached);
  }

  if (clipBuffers.length === 0) {
    await prisma.briefing.update({
      where: { id: briefing.id },
      data: { status: "FAILED", errorMessage: "No clips available for assembly" },
    });
    await prisma.briefingRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: "No clips available" },
    });
    return;
  }

  // Concatenate and store
  const finalAudio = concatMp3Buffers(clipBuffers);
  const today = new Date().toISOString().split("T")[0];
  const audioKey = await putBriefing(env.R2, request.userId, today, finalAudio);

  // Create segments
  for (let i = 0; i < readyEpisodes.length && i < allocations.length; i++) {
    const ep = readyEpisodes[i];
    const clip = await prisma.clip.findFirst({
      where: { episodeId: ep.id, status: "COMPLETED" },
    });
    if (clip) {
      await prisma.briefingSegment.create({
        data: {
          briefingId: briefing.id,
          clipId: clip.id,
          orderIndex: i,
          transitionText: `Next, from ${ep.title}...`,
        },
      });
    }
  }

  // Mark complete
  await prisma.briefing.update({
    where: { id: briefing.id },
    data: { status: "COMPLETED", audioKey },
  });

  await prisma.briefingRequest.update({
    where: { id: request.id },
    data: { status: "COMPLETED", briefingId: briefing.id },
  });
}
```

**Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/orchestrator.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add worker/queues/orchestrator.ts worker/queues/__tests__/orchestrator.test.ts
git commit -m "feat: add orchestrator queue handler for demand-driven pipeline"
```

---

### Task 9: Modify Feed Refresh — Remove Auto-Chain

**Files:**
- Modify: `worker/queues/feed-refresh.ts`
- Modify: `worker/queues/__tests__/feed-refresh.test.ts` (if exists)

**Step 1: Remove auto-chain block**

In `worker/queues/feed-refresh.ts`, delete lines 109-115:

```typescript
// DELETE THIS:
          if (ep.transcriptUrl) {
            await env.DISTILLATION_QUEUE.send({
              episodeId: episode.id,
              transcriptUrl: ep.transcriptUrl,
            });
          }
```

**Step 2: Make episode limit configurable**

Replace line 7 (`const MAX_NEW_EPISODES = 5;`) with config read inside the handler. Move it inside the `handleFeedRefresh` function body, before the podcast loop:

```typescript
const maxEpisodes = (await getConfig(prisma, "pipeline.feedRefresh.maxEpisodesPerPodcast", 5)) as number;
```

Then update line 83 from `latestEpisodes(feed.episodes, MAX_NEW_EPISODES)` to `latestEpisodes(feed.episodes, maxEpisodes)`.

**Step 3: Update/add tests for removed auto-chain**

Test that DISTILLATION_QUEUE.send is NOT called after feed refresh.

**Step 4: Run tests**

Run: `npx vitest run worker/queues/__tests__/feed-refresh.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/feed-refresh.ts worker/queues/__tests__/feed-refresh.test.ts
git commit -m "refactor: remove auto-chain from feed refresh, configurable episode limit"
```

---

### Task 10: Register New Queue Handlers

**Files:**
- Modify: `worker/queues/index.ts`

**Step 1: Add imports and switch cases**

At top of file, add imports:

```typescript
import { handleTranscription } from "./transcription";
import { handleOrchestrator } from "./orchestrator";
```

In the `handleQueue` switch statement (lines 21-42), add cases:

```typescript
    case "transcription":
      return handleTranscription(batch as MessageBatch<any>, env, ctx);
    case "orchestrator":
      return handleOrchestrator(batch as MessageBatch<any>, env, ctx);
```

**Step 2: Commit**

```bash
git add worker/queues/index.ts
git commit -m "wire: register transcription and orchestrator queue handlers"
```

---

## Phase 2B: Backend API Routes (Agent B)

### Task 11: Request Manager API Routes

**Files:**
- Create: `worker/routes/admin/requests.ts`
- Test: `worker/routes/admin/__tests__/requests.test.ts`

**Step 1: Write tests**

Test cases:
1. GET / returns paginated list of BriefingRequests
2. GET /:id returns request with episode-level progress
3. POST /test-briefing creates a test BriefingRequest and sends to orchestrator
4. POST /test-briefing returns 400 if no podcastIds provided

**Step 2: Implement routes**

```typescript
// worker/routes/admin/requests.ts
import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const requestsRoutes = new Hono<{ Bindings: Env }>();

// GET / — List briefing requests with pagination
requestsRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const status = c.req.query("status");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.briefingRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.briefingRequest.count({ where }),
    ]);

    const data = requests.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name,
      userEmail: r.user?.email,
      status: r.status,
      targetMinutes: r.targetMinutes,
      podcastIds: r.podcastIds,
      isTest: r.isTest,
      briefingId: r.briefingId,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /:id — Request detail with episode progress
requestsRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const request = await prisma.briefingRequest.findUnique({
      where: { id: c.req.param("id") },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!request) return c.json({ error: "Request not found" }, 404);

    // Build episode progress
    const episodeProgress = [];
    for (const podcastId of request.podcastIds) {
      const episode = await prisma.episode.findFirst({
        where: { podcastId },
        orderBy: { publishedAt: "desc" },
        include: {
          distillation: true,
          clips: { where: { status: "COMPLETED" } },
          podcast: { select: { title: true } },
        },
      });
      if (!episode) continue;

      const dist = episode.distillation;
      episodeProgress.push({
        episodeId: episode.id,
        episodeTitle: episode.title,
        podcastTitle: episode.podcast.title,
        transcription: getStageStatus(dist, "transcription"),
        distillation: getStageStatus(dist, "distillation"),
        clipGeneration: {
          status: episode.clips.length > 0 ? "COMPLETED" as const : dist?.status === "COMPLETED" ? "WAITING" as const : "WAITING" as const,
        },
      });
    }

    return c.json({
      data: {
        ...request,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        userName: request.user?.name,
        userEmail: request.user?.email,
        episodeProgress,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

function getStageStatus(dist: any, stage: "transcription" | "distillation") {
  if (!dist) return { status: "WAITING" as const };

  if (stage === "transcription") {
    if (dist.status === "PENDING") return { status: "WAITING" as const };
    if (dist.status === "FETCHING_TRANSCRIPT") return { status: "IN_PROGRESS" as const };
    return { status: "COMPLETED" as const }; // TRANSCRIPT_READY or later
  }

  // distillation
  if (["PENDING", "FETCHING_TRANSCRIPT", "TRANSCRIPT_READY"].includes(dist.status)) {
    return { status: "WAITING" as const };
  }
  if (dist.status === "EXTRACTING_CLAIMS") return { status: "IN_PROGRESS" as const };
  if (dist.status === "COMPLETED") return { status: "COMPLETED" as const };
  return { status: "FAILED" as const, errorMessage: dist.errorMessage };
}

// POST /test-briefing — Create admin test briefing request
requestsRoutes.post("/test-briefing", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{ podcastIds: string[]; targetMinutes: number }>();
    if (!body.podcastIds?.length) {
      return c.json({ error: "podcastIds required" }, 400);
    }

    const auth = c.get("clerkAuth") as any;
    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
    });
    if (!user) return c.json({ error: "User not found" }, 404);

    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes: body.targetMinutes || 5,
        podcastIds: body.podcastIds,
        isTest: true,
        status: "PENDING",
      },
    });

    await c.env.ORCHESTRATOR_QUEUE.send({
      requestId: request.id,
      action: "evaluate",
    });

    return c.json({ data: request }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { requestsRoutes };
```

**Step 3: Run tests**

Run: `npx vitest run worker/routes/admin/__tests__/requests.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add worker/routes/admin/requests.ts worker/routes/admin/__tests__/requests.test.ts
git commit -m "feat: add request manager API routes (list, detail, test-briefing)"
```

---

### Task 12: Modify /briefings/generate Route

**Files:**
- Modify: `worker/routes/briefings.ts`

**Step 1: Modify the POST /generate handler**

Replace direct BRIEFING_ASSEMBLY_QUEUE dispatch (lines 123-135) with BriefingRequest creation + orchestrator dispatch:

```typescript
// Get user's subscriptions to determine podcast list
const subscriptions = await prisma.subscription.findMany({
  where: { userId: user.id },
  select: { podcastId: true },
});

const podcastIds = subscriptions.map((s: any) => s.podcastId);

if (podcastIds.length === 0) {
  return c.json({ error: "No podcast subscriptions found" }, 400);
}

const request = await prisma.briefingRequest.create({
  data: {
    userId: user.id,
    targetMinutes,
    podcastIds,
    isTest: false,
    status: "PENDING",
  },
});

// Dispatch to orchestrator
await c.env.ORCHESTRATOR_QUEUE.send({
  requestId: request.id,
  action: "evaluate",
});

return c.json({ briefing: { id: request.id, status: "PENDING", targetMinutes } }, 201);
```

**Step 2: Commit**

```bash
git add worker/routes/briefings.ts
git commit -m "refactor: /briefings/generate creates BriefingRequest via orchestrator"
```

---

### Task 13: Mount Request Routes

**Files:**
- Modify: `worker/routes/admin/index.ts`

**Step 1: Add import and mount**

Add import at top:

```typescript
import { requestsRoutes } from "./requests";
```

Add mount after line 29 (config):

```typescript
adminRoutes.route("/requests", requestsRoutes);
```

**Step 2: Commit**

```bash
git add worker/routes/admin/index.ts
git commit -m "wire: mount request manager routes at /api/admin/requests"
```

---

## Phase 2C: Frontend (Agent C)

### Task 14: Request Manager Page

**Files:**
- Create: `src/pages/admin/requests.tsx`

**Step 1: Create the page**

The page should follow the Moonchild design system (dark navy theme, #0A1628 bg, #1A2942 cards, Inter font, same patterns as other admin pages).

Features:
- Table of BriefingRequests: status badge (PENDING=grey, PROCESSING=blue-pulse, COMPLETED=green, FAILED=red), user name, target minutes, podcast count, test badge, created time
- Expandable row showing episode progress tree (transcription → distillation → clip gen status per episode)
- "Test Briefing" button that opens a dialog: multi-select podcasts from catalog, duration input (1-30 min), submit
- Pagination controls
- Status filter tabs (All, Pending, Processing, Completed, Failed)

Use `useAdminFetch` hook for API calls. Follow patterns from existing pages (pipeline.tsx, briefings.tsx).

The test briefing dialog needs a podcast picker. Use a simple checkbox list fetched from `/api/admin/podcasts`.

**Step 2: Commit**

```bash
git add src/pages/admin/requests.tsx
git commit -m "feat: add Request Manager admin page with test briefing form"
```

---

### Task 15: Add Route and Nav Item

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/layouts/admin-layout.tsx`

**Step 1: Add lazy import in App.tsx**

After line 22 (Configuration import):

```typescript
const Requests = lazy(() => import("./pages/admin/requests"));
```

**Step 2: Add route in App.tsx**

After line 75 (configuration route):

```typescript
<Route path="requests" element={<Suspense fallback={<AdminLoading />}><Requests /></Suspense>} />
```

**Step 3: Add nav item in admin-layout.tsx**

In the navItems array (line 30-39), add after the "Pipeline" entry (line 32):

```typescript
{ path: "requests", label: "Requests", icon: ClipboardList, shortcut: "R" },
```

Import `ClipboardList` from lucide-react (add to import on line 3).

**Step 4: Commit**

```bash
git add src/App.tsx src/layouts/admin-layout.tsx
git commit -m "wire: add Requests page route and sidebar nav item"
```

---

### Task 16: Pipeline Page Enhancements

**Files:**
- Modify: `src/pages/admin/pipeline.tsx`

**Step 1: Add request filter**

Add a dropdown/select in the toolbar that filters pipeline jobs by `requestId`. The options come from a fetch to `/api/admin/requests` (just IDs + status for the dropdown).

**Step 2: Add transcript inspector**

When a user clicks a transcription-type job (stage 2), open a modal/sheet showing the raw transcript text. Fetch from a new detail endpoint or embed in the job detail.

**Step 3: Update stage numbering in UI**

Ensure stage names use the correct 5-stage numbering:
1. Feed Refresh
2. Transcription
3. Distillation
4. Clip Generation
5. Briefing Assembly

**Step 4: Commit**

```bash
git add src/pages/admin/pipeline.tsx
git commit -m "feat: add request filter and transcript inspector to Pipeline page"
```

---

### Task 17: Configuration Page — Max Episodes Setting

**Files:**
- Modify: `src/pages/admin/configuration.tsx`

**Step 1: Add max episodes per podcast field**

In the Pipeline Controls panel (around line 235, after the stage toggles), add:

```tsx
<div className="flex items-center justify-between py-2">
  <div>
    <span className="text-sm text-[#F9FAFB]">Max Episodes per Podcast</span>
    <p className="text-xs text-[#9CA3AF]">
      Maximum new episodes to ingest per podcast per refresh
    </p>
  </div>
  <Input
    type="number"
    min={1}
    max={50}
    value={configs.find(c => c.key === "pipeline.feedRefresh.maxEpisodesPerPodcast")?.value as number ?? 5}
    onChange={(e) => updateConfig("pipeline.feedRefresh.maxEpisodesPerPodcast", parseInt(e.target.value))}
    className="w-20 bg-white/5 border-white/10 text-[#F9FAFB]"
  />
</div>
```

**Step 2: Commit**

```bash
git add src/pages/admin/configuration.tsx
git commit -m "feat: add max episodes per podcast config to Configuration page"
```

---

### Task 18: Update Pipeline Config Hook

**Files:**
- Modify: `src/hooks/use-pipeline-config.ts`

**Step 1: Add triggerTestBriefing function**

```typescript
const triggerTestBriefing = useCallback(
  async (podcastIds: string[], targetMinutes: number) => {
    setTriggering(true);
    try {
      const res = await apiFetch<{ data: any }>("/requests/test-briefing", {
        method: "POST",
        body: JSON.stringify({ podcastIds, targetMinutes }),
      });
      return res.data;
    } catch (e) {
      console.error("Failed to create test briefing:", e);
      return null;
    } finally {
      setTriggering(false);
    }
  },
  [apiFetch]
);
```

Add to the return object.

**Step 2: Update stage names to match new numbering**

Verify STAGE_NAMES constant matches the 5-stage pipeline. Currently correct.

**Step 3: Commit**

```bash
git add src/hooks/use-pipeline-config.ts
git commit -m "feat: add triggerTestBriefing to pipeline config hook"
```

---

## Phase 3: Integration & Cleanup

### Task 19: Update Stage Config Keys

**Files:**
- Modify: `worker/queues/clip-generation.ts` (stage 3 → 4)
- Modify: `worker/queues/briefing-assembly.ts` (stage 4 → 5)
- Verify: `worker/queues/feed-refresh.ts` (stage 1, unchanged)
- Verify: `worker/queues/transcription.ts` (stage 2, new)
- Verify: `worker/queues/distillation.ts` (stage 2 → 3)

Update the config key checks:
- Clip generation: `pipeline.stage.3.enabled` → `pipeline.stage.4.enabled`
- Briefing assembly: `pipeline.stage.4.enabled` → `pipeline.stage.5.enabled`

Also update any PipelineJob creation that hardcodes `stage` numbers.

**Step 1: Make changes**

**Step 2: Run all backend tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`
Expected: All pass

**Step 3: Commit**

```bash
git add worker/queues/
git commit -m "fix: update stage config keys to match 5-stage numbering"
```

---

### Task 20: Run Full Test Suite

**Step 1: Run backend tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/ --reporter=verbose`
Expected: All pass

**Step 2: Run frontend tests**

Run: `npx vitest run src/ --reporter=verbose`
Expected: All pass

**Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Fix any failures, commit**

```bash
git add -A
git commit -m "test: fix test suite after demand-driven pipeline changes"
```

---

### Task 21: Final Integration Commit

**Step 1: Verify everything works**

- All tests pass
- TypeScript clean
- No console errors

**Step 2: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: demand-driven pipeline with orchestrator, request manager, and admin UI"
```
