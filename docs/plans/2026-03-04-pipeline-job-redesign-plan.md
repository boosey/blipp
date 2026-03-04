# PipelineJob Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic PipelineJob audit model with a proper job lifecycle system where each job tracks one episode+durationTier through the pipeline stages, with PipelineStep audit records per stage.

**Architecture:** BriefingRequest gets an `items` JSON field (replacing parallel arrays). The orchestrator creates PipelineJobs from items and manages stage advancement. Each stage handler creates PipelineStep records, checks work product caches, and reports completion back to the orchestrator. Assembly supports partial success.

**Tech Stack:** Prisma 7 (cloudflare runtime), Hono, Cloudflare Queues, Vitest

**Working directory:** `C:/Users/boose/Projects/blipp/.claude/worktrees/moonchild-admin-ui`

---

### Task 1: Schema Migration — Replace PipelineJob, Add PipelineStep, Update BriefingRequest

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Update the Prisma schema**

Replace the PipelineJob model, add PipelineStep, update BriefingRequest, add new enums, drop old enums.

```prisma
// ── Replace the old PipelineJob model (lines ~206-242) with: ──

model PipelineJob {
  id             String            @id @default(cuid())
  requestId      String
  episodeId      String
  durationTier   Int               // from request item — source of truth
  status         PipelineJobStatus @default(PENDING)
  currentStage   PipelineStage     @default(TRANSCRIPTION)
  distillationId String?
  clipId         String?
  errorMessage   String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  completedAt    DateTime?

  request  BriefingRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  episode  Episode         @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  steps    PipelineStep[]
}

enum PipelineStage {
  TRANSCRIPTION
  DISTILLATION
  CLIP_GENERATION
}

enum PipelineJobStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

model PipelineStep {
  id           String             @id @default(cuid())
  jobId        String
  stage        PipelineStage
  status       PipelineStepStatus @default(PENDING)
  cached       Boolean            @default(false)
  input        Json?
  output       Json?
  errorMessage String?
  startedAt    DateTime?
  completedAt  DateTime?
  durationMs   Int?
  cost         Float?
  retryCount   Int                @default(0)
  createdAt    DateTime           @default(now())

  job PipelineJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

enum PipelineStepStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  SKIPPED
  FAILED
}
```

Also update BriefingRequest (lines ~246-262):

```prisma
model BriefingRequest {
  id            String               @id @default(cuid())
  userId        String
  status        BriefingRequestStatus @default(PENDING)
  targetMinutes Int
  items         Json                 // BriefingRequestItem[]
  isTest        Boolean              @default(false)
  briefingId    String?              @unique
  errorMessage  String?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  briefing Briefing?      @relation(fields: [briefingId], references: [id])
  jobs     PipelineJob[]
}
```

Remove old enums: `PipelineJobType` (lines ~227-233).

Add `pipelineJobs PipelineJob[]` relation to Episode model.

**Step 2: Run `prisma generate` to update the client**

Run: `npx prisma generate`
Expected: Success, generated client at `src/generated/prisma`

**Step 3: Create the barrel export (known issue)**

Create `src/generated/prisma/index.ts` if it doesn't exist:

```typescript
export * from ".prisma/client/default";
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma src/generated/prisma/index.ts
git commit -m "feat: replace PipelineJob model with job lifecycle + PipelineStep audit"
```

---

### Task 2: Shared Type Contracts — Update `src/types/admin.ts`

This is a **blocking dependency** for all other tasks. Must complete before parallel work begins.

**Files:**
- Modify: `src/types/admin.ts`

**Step 1: Update BriefingRequest-related types**

Replace the BriefingRequest interface and add BriefingRequestItem:

```typescript
// ── Briefing Requests ──

export interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;  // null when useLatest is true
  durationTier: number;      // source of truth for this item's time
  useLatest: boolean;
}

export interface BriefingRequest {
  id: string;
  userId: string;
  status: BriefingRequestStatus;
  targetMinutes: number;
  items: BriefingRequestItem[];
  isTest: boolean;
  briefingId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userEmail?: string;
  jobProgress?: JobProgress[];
}
```

**Step 2: Replace PipelineJob types with new job/step types**

```typescript
// ── Pipeline Job (new) ──

export interface PipelineJob {
  id: string;
  requestId: string;
  episodeId: string;
  durationTier: number;
  status: PipelineJobStatus;
  currentStage: PipelineStage;
  distillationId?: string;
  clipId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Joined data
  episodeTitle?: string;
  podcastTitle?: string;
  podcastImageUrl?: string;
  steps?: PipelineStep[];
}

export type PipelineStage = "TRANSCRIPTION" | "DISTILLATION" | "CLIP_GENERATION";

export type PipelineJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface PipelineStep {
  id: string;
  jobId: string;
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  cost?: number;
  retryCount: number;
  createdAt: string;
}

export type PipelineStepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "FAILED";
```

**Step 3: Replace EpisodeProgress with JobProgress**

```typescript
export interface JobProgress {
  jobId: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  durationTier: number;
  status: PipelineJobStatus;
  currentStage: PipelineStage;
  steps: StepProgress[];
}

export interface StepProgress {
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  durationMs?: number;
  cost?: number;
  errorMessage?: string;
}
```

**Step 4: Remove old types**

Delete: `PipelineJobType`, old `EpisodeProgress`, old `StageProgress`, `EnrichedPipelineJob`, `PipelineJobRequestContext`.

Update `PipelineStageStats` to remove `stage: number` and use `PipelineStage` instead.

Update `PipelineJobFilters` to remove `type` field.

**Step 5: Commit**

```bash
git add src/types/admin.ts
git commit -m "feat: update shared type contracts for PipelineJob/Step redesign"
```

---

### Task 3: Update Test Mocks — Add `pipelineStep` to Mock Factory

**Files:**
- Modify: `tests/helpers/mocks.ts`

**Step 1: Add `pipelineStep` model to `createMockPrisma()`**

Add after `pipelineJob: modelMethods(),`:

```typescript
pipelineStep: modelMethods(),
```

**Step 2: Commit**

```bash
git add tests/helpers/mocks.ts
git commit -m "feat: add pipelineStep to mock prisma factory"
```

---

### Task 4: Update Logger — Add `jobId` to Context

**Files:**
- Modify: `worker/lib/logger.ts`

**Step 1: Add `jobId` to LoggerOptions and base context**

Update `LoggerOptions` interface:

```typescript
interface LoggerOptions {
  stage: string;
  requestId?: string;
  jobId?: string;
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } };
}
```

Add to base context creation:

```typescript
if (opts.jobId) base.jobId = opts.jobId;
```

**Step 2: Write test for jobId in logger output**

Run existing tests: `npx vitest run worker/lib/__tests__/logger.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add worker/lib/logger.ts
git commit -m "feat: add jobId to pipeline logger context"
```

---

### Task 5: Rewrite Orchestrator — Job Creation and Stage Advancement

**Files:**
- Modify: `worker/queues/orchestrator.ts`

**Step 1: Define new message types**

```typescript
interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "job-stage-complete";
  jobId?: string;
}

interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;
  durationTier: number;
  useLatest: boolean;
}

const NEXT_STAGE: Record<string, string | null> = {
  TRANSCRIPTION: "DISTILLATION",
  DISTILLATION: "CLIP_GENERATION",
  CLIP_GENERATION: null, // terminal
};
```

**Step 2: Implement "evaluate" action**

When `action === "evaluate"`:
1. Load request, parse `items` as `BriefingRequestItem[]`
2. Resolve `useLatest` items to actual episodeIds (findFirst by podcastId, orderBy publishedAt desc)
3. Create a PipelineJob per resolved item: `{ requestId, episodeId, durationTier, status: PENDING, currentStage: TRANSCRIPTION }`
4. Set request status to `PROCESSING`
5. Dispatch each job to `TRANSCRIPTION_QUEUE`: `{ jobId, episodeId }`

**Step 3: Implement "job-stage-complete" action**

When `action === "job-stage-complete"`:
1. Load the job by `jobId`
2. Determine next stage via `NEXT_STAGE[job.currentStage]`
3. If next stage exists: update `job.currentStage`, dispatch to appropriate queue
   - DISTILLATION: `{ jobId, episodeId }` to `DISTILLATION_QUEUE`
   - CLIP_GENERATION: `{ jobId, episodeId, durationTier }` to `CLIP_GENERATION_QUEUE`
4. If no next stage (clip gen complete): mark job `COMPLETED`, set `completedAt`
5. Check: are ALL jobs for this request done (COMPLETED or FAILED)?
   - Count completed vs failed
   - If all done → trigger assembly (inline or via assembly queue)
   - Partial assembly: if some completed and some failed, still assemble from completed clips

**Step 4: Implement assembly logic**

When all jobs are done:
1. Find all COMPLETED jobs for the request, include their clips via `clipId`
2. Fetch clip audio from R2
3. Concatenate MP3s
4. Create Briefing + BriefingSegments
5. Mark request COMPLETED (or COMPLETED with partial note)

**Step 5: Write tests**

Test file: `worker/queues/__tests__/orchestrator.test.ts`

Tests needed:
- `evaluate` creates PipelineJobs from request items
- `evaluate` resolves useLatest items
- `evaluate` dispatches jobs to TRANSCRIPTION_QUEUE
- `job-stage-complete` advances job to next stage
- `job-stage-complete` dispatches to correct queue per stage
- `job-stage-complete` marks job COMPLETED after clip gen
- All jobs completed triggers assembly
- Partial assembly when some jobs fail
- Stale request (deleted) is acked

**Step 6: Run tests**

Run: `npx vitest run worker/queues/__tests__/orchestrator.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add worker/queues/orchestrator.ts worker/queues/__tests__/orchestrator.test.ts
git commit -m "feat: rewrite orchestrator for job lifecycle management"
```

---

### Task 6: Rewrite Transcription Handler — PipelineStep + Cache + Whisper Fallback

**Files:**
- Modify: `worker/queues/transcription.ts`

**Step 1: Update message interface**

```typescript
interface TranscriptionMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}
```

**Step 2: Implement new handler logic**

For each message:
1. Load job by `jobId` (get `requestId` from job)
2. Mark job `IN_PROGRESS` if `PENDING`
3. Create PipelineStep: `{ jobId, stage: "TRANSCRIPTION", status: "IN_PROGRESS", startedAt: now() }`
4. **Cache check**: Find `Distillation` where `episodeId` and `transcript` is not null and status >= `TRANSCRIPT_READY`
   - If exists: mark step `SKIPPED`, set `cached: true`, update job `distillationId`
5. **Feed URL**: Load episode, if `episode.transcriptUrl` exists, fetch transcript, upsert Distillation
6. **Whisper fallback**: If no transcriptUrl, send `episode.audioUrl` to OpenAI Whisper
   - `new OpenAI({ apiKey: env.OPENAI_API_KEY })` → `openai.audio.transcriptions.create({ model: "whisper-1", file: audioStream })`
   - Note: for CF Workers, may need to fetch audio as blob, pass to Whisper API via form data
7. Upsert Distillation with transcript, status `TRANSCRIPT_READY`
8. Mark step `COMPLETED`, set `completedAt`, `durationMs`
9. Update job `distillationId`
10. Report to ORCHESTRATOR_QUEUE: `{ requestId, action: "job-stage-complete", jobId }`

**Step 3: Keep manual/stage-gate logic intact**

The `type: "manual"` bypass and `pipeline.stage.2.enabled` gate stay.

For manual messages without `jobId`, create a minimal flow (just do transcription, no job/step tracking). Or require jobId always.

**Step 4: Write tests**

Test file: `worker/queues/__tests__/transcription.test.ts`

Tests needed:
- Creates PipelineStep on processing
- Cache hit → step SKIPPED, cached: true
- Feed URL → fetches transcript, step COMPLETED
- Whisper fallback when no transcriptUrl (mock OpenAI)
- Reports to orchestrator with jobId
- Stage gate disabled → acks all
- Error → step FAILED, msg.retry()

**Step 5: Run tests**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: rewrite transcription handler with PipelineStep, cache, Whisper fallback"
```

---

### Task 7: Rewrite Distillation Handler — PipelineStep + Cache

**Files:**
- Modify: `worker/queues/distillation.ts`

**Step 1: Update message interface**

```typescript
interface DistillationMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}
```

**Step 2: Implement new handler logic**

For each message:
1. Load job by `jobId`
2. Mark job `IN_PROGRESS`
3. Create PipelineStep: `{ jobId, stage: "DISTILLATION", status: "IN_PROGRESS" }`
4. **Cache check**: `Distillation.status === "COMPLETED"` for this episodeId
   - If cached: mark step `SKIPPED`, cached: true
5. If not cached: load transcript from Distillation, run `extractClaims()`, update Distillation to COMPLETED
6. Mark step `COMPLETED`
7. Report to ORCHESTRATOR_QUEUE: `{ requestId, action: "job-stage-complete", jobId }`

**Step 3: Write tests**

Tests needed:
- Creates PipelineStep
- Cache hit → step SKIPPED
- Extracts claims when not cached
- Reports to orchestrator
- Error handling

**Step 4: Run tests**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "feat: rewrite distillation handler with PipelineStep and cache check"
```

---

### Task 8: Rewrite Clip Generation Handler — PipelineStep + Cache

**Files:**
- Modify: `worker/queues/clip-generation.ts`

**Step 1: Update message interface**

```typescript
interface ClipGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}
```

**Step 2: Implement new handler logic**

For each message:
1. Load job by `jobId`
2. Mark job `IN_PROGRESS`
3. Create PipelineStep: `{ jobId, stage: "CLIP_GENERATION", status: "IN_PROGRESS" }`
4. **Cache check**: `Clip` exists for `(episodeId, durationTier)` with status COMPLETED
   - If cached: mark step `SKIPPED`, cached: true, update job `clipId`
5. If not cached:
   - Load distillation claims from DB (by `job.distillationId` or episode lookup)
   - Generate narrative via Claude (Pass 2)
   - Generate TTS audio
   - Upload to R2
   - Create/update Clip record
6. Mark step `COMPLETED`, update job `clipId`
7. Report to ORCHESTRATOR_QUEUE: `{ requestId, action: "job-stage-complete", jobId }`

**Step 3: Write tests**

Tests needed:
- Creates PipelineStep
- Cache hit → step SKIPPED
- Full flow: narrative → TTS → R2
- Reports to orchestrator
- Error handling

**Step 4: Run tests**

Run: `npx vitest run worker/queues/__tests__/clip-generation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/clip-generation.ts worker/queues/__tests__/clip-generation.test.ts
git commit -m "feat: rewrite clip generation handler with PipelineStep and cache check"
```

---

### Task 9: Update Briefing Assembly Handler — Remove Standalone Logic

**Files:**
- Modify: `worker/queues/briefing-assembly.ts`

**Step 1: Simplify or deprecate**

The orchestrator now handles assembly inline after all jobs complete. The standalone `briefing-assembly.ts` handler was for the old subscription-based flow. Options:

A. **Keep it as a legacy fallback** — but make the orchestrator the primary assembly path.
B. **Remove it** — assembly only happens in the orchestrator.

Recommended: **Keep it but slim it down.** The handler can still be used for manual/scheduled assembly. But for demand-driven requests, assembly happens in the orchestrator.

No PipelineJob/Step changes needed here since assembly is not a tracked stage in the redesign.

**Step 2: Update tests if logic changed**

Run: `npx vitest run worker/queues/__tests__/briefing-assembly.test.ts`
Expected: PASS (or update if message shape changed)

**Step 3: Commit**

```bash
git add worker/queues/briefing-assembly.ts worker/queues/__tests__/briefing-assembly.test.ts
git commit -m "refactor: slim down briefing-assembly handler, assembly now runs in orchestrator"
```

---

### Task 10: Update Admin Requests Route — Items + Job Progress

**Files:**
- Modify: `worker/routes/admin/requests.ts`

**Step 1: Update GET / — Return items instead of podcastIds/episodeIds**

Replace mapping of `podcastIds`, `episodeIds`, `useLatest` with:

```typescript
items: r.items as any[], // BriefingRequestItem[]
```

**Step 2: Update GET /:id — Return job/step progress**

Replace the `episodeProgress` loop (which iterated over `podcastIds`) with:

```typescript
const jobs = await prisma.pipelineJob.findMany({
  where: { requestId: request.id },
  include: {
    episode: { select: { title: true, podcast: { select: { title: true } } } },
    steps: { orderBy: { createdAt: "asc" } },
  },
  orderBy: { createdAt: "asc" },
});

const jobProgress = jobs.map((job: any) => ({
  jobId: job.id,
  episodeId: job.episodeId,
  episodeTitle: job.episode.title,
  podcastTitle: job.episode.podcast.title,
  durationTier: job.durationTier,
  status: job.status,
  currentStage: job.currentStage,
  steps: job.steps.map((s: any) => ({
    stage: s.stage,
    status: s.status,
    cached: s.cached,
    durationMs: s.durationMs,
    cost: s.cost,
    errorMessage: s.errorMessage,
  })),
}));
```

Return `jobProgress` instead of `episodeProgress`.

**Step 3: Update POST /test-briefing — Use items format**

Accept: `{ items: BriefingRequestItem[], targetMinutes: number }`

Create BriefingRequest with `items` JSON field.

For backward compat during transition, optionally accept old format and convert.

**Step 4: Write/update tests**

Run: `npx vitest run worker/routes/admin/__tests__/` (if request tests exist)

**Step 5: Commit**

```bash
git add worker/routes/admin/requests.ts
git commit -m "feat: update admin requests route for items + job/step progress"
```

---

### Task 11: Update Admin Pipeline Route — New PipelineJob Model

**Files:**
- Modify: `worker/routes/admin/pipeline.ts`

**Step 1: Update GET /jobs — Query new PipelineJob model**

Replace `entityId`/`entityType` queries with `episodeId`, `requestId` joins.

Update filters: remove `type` filter, add `requestId` filter, `currentStage` filter.

Join episode and podcast names via the `episode` relation.

**Step 2: Update GET /jobs/:id — Include steps**

Include `steps` in the query. Replace `upstreamProgress` logic (now directly from job.steps).

Replace `requestContext` with join on `request` relation.

**Step 3: Update POST /jobs/:id/retry — New dispatch logic**

Dispatch based on `job.currentStage` instead of `job.type`:
- `TRANSCRIPTION` → `TRANSCRIPTION_QUEUE.send({ jobId, episodeId })`
- `DISTILLATION` → `DISTILLATION_QUEUE.send({ jobId, episodeId })`
- `CLIP_GENERATION` → `CLIP_GENERATION_QUEUE.send({ jobId, episodeId, durationTier })`

**Step 4: Update GET /stages — Aggregate by currentStage**

Replace `groupBy stage (int)` with `groupBy currentStage (enum)`.

**Step 5: Update trigger endpoints**

For manual triggers, create ad-hoc jobs or send manual messages without jobId.

**Step 6: Commit**

```bash
git add worker/routes/admin/pipeline.ts
git commit -m "feat: update admin pipeline route for new PipelineJob model"
```

---

### Task 12: Update User Briefings Route — Items Format

**Files:**
- Modify: `worker/routes/briefings.ts`

**Step 1: Update POST /generate**

Change from subscription-based `podcastIds[]` to items format:

```typescript
// Get user's subscriptions
const subscriptions = await prisma.subscription.findMany({...});

// Build items from subscriptions (useLatest for all, equal time split)
const perEpisodeTier = nearestTier(targetMinutes / subscriptions.length);
const items = subscriptions.map((s) => ({
  podcastId: s.podcastId,
  episodeId: null,
  durationTier: perEpisodeTier,
  useLatest: true,
}));

const request = await prisma.briefingRequest.create({
  data: {
    userId: user.id,
    targetMinutes,
    items: items as any,
    isTest: false,
    status: "PENDING",
  },
});
```

Import `nearestTier` from `worker/lib/time-fitting.ts`.

**Step 2: Run tests**

Run: `npx vitest run worker/routes/admin/__tests__/briefings.test.ts` (if exists)

**Step 3: Commit**

```bash
git add worker/routes/briefings.ts
git commit -m "feat: update user briefings route to use items format"
```

---

### Task 13: Update Frontend — Requests Page

**Files:**
- Modify: `src/pages/admin/requests.tsx`

**Step 1: Update request list to show items instead of podcastIds**

Replace references to `podcastIds`, `episodeIds`, `useLatest` with `items` array.

**Step 2: Update expanded row — Show job progress tree**

Replace `episodeProgress` rendering with `jobProgress` rendering:
- Each job = a row showing episode title, podcast, durationTier badge, status, currentStage
- Each job has sub-rows for steps: Transcription, Distillation, Clip Gen — each with status icon, cached badge, timing

**Step 3: Update test briefing dialog — Use items format**

Change form to produce `BriefingRequestItem[]` instead of parallel arrays.

**Step 4: Commit**

```bash
git add src/pages/admin/requests.tsx
git commit -m "feat: update admin requests page for job/step progress display"
```

---

### Task 14: Update Frontend — Pipeline Page

**Files:**
- Modify: `src/pages/admin/pipeline.tsx`

**Step 1: Update STAGE_META constant**

Replace stage numbers with PipelineStage enum values. Drop stage 1.

**Step 2: Update job card rendering**

Show: episode title, podcast, durationTier badge, currentStage indicator.

On expand: show PipelineStep detail with cached/timing/cost per stage.

**Step 3: Update filters**

Remove `type` filter. Add `currentStage` filter. Keep `requestId` filter.

**Step 4: Commit**

```bash
git add src/pages/admin/pipeline.tsx
git commit -m "feat: update admin pipeline page for new PipelineJob model"
```

---

### Task 15: Clean Up DB Utility Scripts

**Files:**
- Modify: `scripts/clean-pipeline.ts` (if exists)
- Modify: `scripts/clean-requests.ts` (if exists)

**Step 1: Update clean scripts for new schema**

- `clean:pipeline` should delete PipelineStep records too (cascade should handle this, but verify)
- `clean:requests` should note that deleting requests cascades to PipelineJobs → PipelineSteps

**Step 2: Commit**

```bash
git add scripts/
git commit -m "refactor: update clean scripts for new pipeline schema"
```

---

### Task 16: Final Integration Test

**Step 1: Run all backend tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/queues/__tests__/`
Expected: All tests PASS

**Step 2: Run admin route tests**

Run: `npx vitest run worker/routes/admin/__tests__/`
Expected: All tests PASS

**Step 3: Run frontend admin tests**

Run: `npx vitest run src/__tests__/admin/`
Expected: All tests PASS (or known pre-existing failures only)

**Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve integration test issues from pipeline job redesign"
```

---

## Task Dependency Graph

```
Task 1 (Schema) ──┐
                   ├── Task 2 (Types) ── BLOCKING ──┬── Task 5 (Orchestrator)
Task 3 (Mocks) ───┘                                 ├── Task 6 (Transcription)
Task 4 (Logger) ─────────────────────────────────────├── Task 7 (Distillation)
                                                     ├── Task 8 (Clip Gen)
                                                     ├── Task 9 (Assembly)
                                                     ├── Task 10 (Admin Requests Route)
                                                     ├── Task 11 (Admin Pipeline Route)
                                                     ├── Task 12 (User Briefings Route)
                                                     ├── Task 13 (Frontend Requests)
                                                     └── Task 14 (Frontend Pipeline)
                                                            │
                                                     Task 15 (Clean Scripts)
                                                     Task 16 (Integration Test)
```

Tasks 1-4 are sequential prereqs. Task 2 (types) is the shared contract blocker.
Tasks 5-14 can run in parallel after Task 2 completes.
Tasks 15-16 run after all others.
