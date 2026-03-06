# Demand-Driven Pipeline with Request Manager & Job Manager

**Date**: 2026-03-02 (revised 2026-03-04)
**Branch**: moonchild-admin-ui
**Status**: Approved

## Overview

Redesign the Blipp pipeline from auto-chaining to demand-driven. Only feed refresh runs automatically. All other stages (transcription, distillation, clip generation, briefing assembly) run on-demand when a user requests a briefing. A new orchestrator manages the lifecycle of each request through stages, and each stage reports back when complete.

## Architecture

### Core Concepts

- **BriefingRequest**: A user wants a briefing for one or more podcast/episode combos at a target duration. Tracks lifecycle (PENDING → PROCESSING → COMPLETED/FAILED).
- **PipelineJob**: The mechanism that produces the deliverable for ONE episode at a specific duration tier. A request has one or more jobs (one per episode in a digest). The job flows through stages sequentially.
- **PipelineStep**: Audit trail entry for one stage's processing of a job. Records timing, cost, errors, and whether the stage reused a cached work product.
- **Orchestrator**: A Cloudflare Queue handler that receives "evaluate" and "job-stage-complete" messages. Creates jobs, dispatches to stage queues, advances jobs through stages, and triggers assembly when all jobs complete.

<details><summary>Original concepts (2026-03-02)</summary>

- ~~**Request Manager**: Handles user briefing requests. Checks if the requested product already exists or is in-progress. If neither, creates a pipeline job. Tracks the request to completion and responds to the user.~~
- ~~**Job Manager**: Monitors individual pipeline jobs through queues, updates job status, and reports stage completion back to the orchestrator.~~
- ~~**Orchestrator**: A Cloudflare Queue handler that receives "evaluate" and "stage-complete" messages. Evaluates what work is needed for a request, dispatches to stage queues, and advances when stages report back.~~

</details>

### Pipeline Stages

| # | Name | Queue | Trigger |
|---|------|-------|---------|
| 1 | Feed Refresh | FEED_REFRESH_QUEUE | Cron or manual |
| 2 | Transcription | TRANSCRIPTION_QUEUE (new) | On-demand (orchestrator) or manual |
| 3 | Distillation | DISTILLATION_QUEUE | On-demand (orchestrator) or manual |
| 4 | Clip Generation | CLIP_GENERATION_QUEUE | On-demand (orchestrator) or manual |
| 5 | Briefing Assembly | Handled by orchestrator | On-demand (orchestrator) |

## Data Model

### Relationships

```
BriefingRequest (1) ──→ (many) PipelineJob
PipelineJob (1) ──→ (many) PipelineStep
PipelineJob ──→ Episode
PipelineJob ──→ Distillation (populated when stage completes/skips)
PipelineJob ──→ Clip (populated when stage completes/skips)
```

### BriefingRequest (revised 2026-03-04)

```prisma
model BriefingRequest {
  id            String               @id @default(cuid())
  userId        String
  status        BriefingRequestStatus @default(PENDING)
  targetMinutes Int                  // max total time budget
  items         Json                 // BriefingRequestItem[] — see below
  isTest        Boolean              @default(false)
  briefingId    String?              @unique
  errorMessage  String?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  briefing Briefing?      @relation(fields: [briefingId], references: [id])
  jobs     PipelineJob[]
}

enum BriefingRequestStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

**`items` JSON shape** (TypeScript):

```typescript
interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;  // null when useLatest is true (resolved at creation time)
  durationTier: number;      // per-item time allocation (1, 2, 3, 5, 7, 10, 15 min)
  useLatest: boolean;
}
```

**Time rules:**
- Each item's `durationTier` is the **source of truth** for that episode's processing.
- `targetMinutes` on the request = max ceiling of the sum of item `durationTier` values.
- The UI enforces time constraints (equal split default, per-item override, sum ≤ ceiling). The backend does not — it creates PipelineJobs directly from items using each item's `durationTier` as-is.

<details><summary>Original BriefingRequest (2026-03-02) — replaced</summary>

```prisma
~~ model BriefingRequest {
~~   ...
~~   podcastIds    String[]
~~   episodeIds    String[]             @default([])
~~   useLatest     Boolean              @default(true)
~~   ...
~~ }
```

~~Separate arrays for podcastIds, episodeIds, and a single useLatest flag. Didn't support per-item time allocation or per-item useLatest. The orchestrator had to run `allocateWordBudget` to compute tiers server-side.~~

</details>

### PipelineJob (revised 2026-03-04)

A job produces the deliverable for one episode at a specific duration tier. A request has one or more jobs.

```prisma
model PipelineJob {
  id             String            @id @default(cuid())
  requestId      String
  episodeId      String
  durationTier   Int               // from request item — source of truth for this job's time
  status         PipelineJobStatus @default(PENDING)
  currentStage   PipelineStage     @default(TRANSCRIPTION)

  // Cached work product references (populated as stages complete/skip)
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
```

<details><summary>Original PipelineJob design (2026-03-02) — replaced</summary>

~~Add two fields to the existing generic PipelineJob:~~

```prisma
model PipelineJob {
  // ... existing generic fields (entityId, entityType, stage int, etc.) ...
  requestId    String?   // links to BriefingRequest (null for manual/cron jobs)
  parentJobId  String?   // for job trees (request spawns multiple episode jobs)
}
```

~~This reused the generic PipelineJob with `entityId`/`entityType`. Replaced because: jobs need explicit episode+durationTier identity, the generic model couldn't answer "what stage is this job at?" or "has this combo been processed before?", and only transcription ever created job records.~~

</details>

### PipelineStep (new 2026-03-04)

Audit trail per stage per job. Each stage handler creates one step record.

```prisma
model PipelineStep {
  id           String             @id @default(cuid())
  jobId        String
  stage        PipelineStage
  status       PipelineStepStatus @default(PENDING)
  cached       Boolean            @default(false) // true = reused existing work product
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
  SKIPPED     // cached work product already existed
  FAILED
}
```

### Dropped Enums (2026-03-04)

~~`PipelineJobType`~~ (FEED_REFRESH, TRANSCRIPTION, etc.) — jobs are not typed; they flow through stages. Feed refresh is not part of the demand pipeline.

~~`RUNNING`~~ and ~~`RETRYING`~~ from PipelineJobStatus — simplified to PENDING/IN_PROGRESS/COMPLETED/FAILED.

### Modified: DistillationStatus

Add `TRANSCRIPT_READY` status:

```prisma
enum DistillationStatus {
  PENDING
  FETCHING_TRANSCRIPT
  TRANSCRIPT_READY       // transcript fetched, ready for claim extraction
  EXTRACTING_CLAIMS
  COMPLETED
  FAILED
}
```

## Caching Strategy (added 2026-03-04)

The existing **Distillation** and **Clip** models serve as work product caches. Each stage checks for cached artifacts before doing work:

| Stage | Cache key | Check | Hit → |
|-------|-----------|-------|-------|
| Transcription | `episodeId` | `Distillation` exists with `transcript` and status ≥ `TRANSCRIPT_READY` | Step SKIPPED, job advances |
| Distillation | `episodeId` | `Distillation.status === COMPLETED` | Step SKIPPED, job advances |
| Clip Generation | `(episodeId, durationTier)` | `Clip.status === COMPLETED` | Step SKIPPED, job COMPLETED |

Work products from earlier requests are automatically reused.

## Transcript Sources (added 2026-03-04)

The Transcription stage resolves transcripts from three sources (in priority order):

1. **Cached** — `Distillation.transcript` already exists (from a previous request)
2. **Feed-provided** — `episode.transcriptUrl` exists, fetch it
3. **Audio-generated** — send `episode.audioUrl` to OpenAI Whisper for speech-to-text

Every episode is processable. The only failure mode is an actual error (fetch failed, STT service down).

## Partial Assembly (added 2026-03-04)

If some jobs for a digest request fail (e.g., STT timeout on one episode), the briefing is assembled from the successful clips. The request completes with a note about the failed episode. Free-tier clips are paired with ads during assembly.

## Message Flow

### User Briefing Request

```
1. User → POST /briefings/generate
   → body: { items: [{ podcastId, episodeId, durationTier, useLatest }], targetMinutes }
   → Resolves useLatest items to actual episodeIds
   → Creates BriefingRequest (PENDING)
   → Sends to ORCHESTRATOR_QUEUE: { requestId, action: "evaluate" }

2. Orchestrator receives { action: "evaluate" }:
   → Loads request items
   → Creates PipelineJob per item: { requestId, episodeId, durationTier }
   → Dispatches each job to TRANSCRIPTION_QUEUE: { jobId, episodeId }
   → Updates request status to PROCESSING

3. Stage handler (transcription/distillation/clip-gen):
   → Creates PipelineStep { jobId, stage, status: IN_PROGRESS }
   → Checks for cached work product
   → If cached: marks step SKIPPED
   → If not: does the work, stores result, marks step COMPLETED
   → Reports to ORCHESTRATOR_QUEUE: { requestId, action: "job-stage-complete", jobId }

4. Orchestrator receives { action: "job-stage-complete" }:
   → Advances job.currentStage to next stage
   → Dispatches to next queue
   → After Clip Generation completes → marks job COMPLETED
   → Checks: are ALL jobs for this request done?
   → If all done → triggers assembly → marks request COMPLETED
```

### Digest Example (multiple items)

```
1. Request items: [
     { podA, ep1, tier 5, useLatest: false },
     { podB, null, tier 5, useLatest: true },
     { podC, null, tier 5, useLatest: true }
   ], targetMinutes: 15
2. Backend resolves useLatest → actual episodeIds
3. Creates 3 PipelineJobs — all dispatched independently (parallel)
4. Each job flows through stages using its own durationTier
5. When all 3 jobs COMPLETED → assembly combines clips into one briefing
6. If job 3 FAILED → partial assembly from jobs 1+2, note the gap
```

### Admin Test Briefing

```
Admin → POST /api/admin/requests/test-briefing
  body: { items: [{ podcastId, episodeId?, durationTier, useLatest }], targetMinutes }
→ Resolves useLatest items to actual episodeIds
→ Creates BriefingRequest (isTest: true, userId: admin's userId)
→ Same orchestrator flow as above
```

### Cron Feed Refresh (unchanged)

```
Cron → FEED_REFRESH_QUEUE → polls RSS → upserts Episode rows → done
No auto-chaining. Feed refresh is pre-pipeline.
```

### Manual Stage Triggers (unchanged)

```
Admin → POST /admin/pipeline/trigger/stage/:stage
→ Dispatches directly to stage queue with type: "manual"
→ No requestId, no orchestrator callback
```

<details><summary>Original message flow (2026-03-02) — replaced</summary>

~~The original flow had the orchestrator re-evaluating all episodes on every stage-complete callback, dispatching directly to the next needed stage per episode. There was no PipelineJob lifecycle — the orchestrator tracked progress by inspecting Distillation/Clip model statuses ad-hoc. This made it impossible to answer "what stage is this episode at?" without re-running the evaluation logic.~~

</details>

## Stage Handlers

### worker/queues/transcription.ts (stage 2)

- Receives `{ jobId, episodeId }`
- Creates PipelineStep `{ jobId, stage: TRANSCRIPTION }`
- Checks cache: `Distillation.transcript` exists → step SKIPPED
- Checks feed: `episode.transcriptUrl` exists → fetch it → step COMPLETED
- Fallback: sends `episode.audioUrl` to OpenAI Whisper → step COMPLETED
- Upserts Distillation record with `status: TRANSCRIPT_READY`
- Reports `{ requestId, action: "job-stage-complete", jobId }` to ORCHESTRATOR_QUEUE

<details><summary>Original transcription handler (2026-03-02)</summary>

~~Received `{ episodeId, transcriptUrl, requestId? }`. Only fetched from transcript URL — no cached check, no audio fallback. Created a generic PipelineJob record. Episodes without `transcriptUrl` were silently skipped by the orchestrator.~~

</details>

### worker/queues/distillation.ts (stage 3)

- Receives `{ jobId, episodeId }`
- Creates PipelineStep `{ jobId, stage: DISTILLATION }`
- Checks cache: `Distillation.status === COMPLETED` → step SKIPPED
- If not cached: extracts claims via Claude (Pass 1) → step COMPLETED
- Reports `{ requestId, action: "job-stage-complete", jobId }` to ORCHESTRATOR_QUEUE

### worker/queues/clip-generation.ts (stage 4)

- Receives `{ jobId, episodeId, durationTier }`
- Creates PipelineStep `{ jobId, stage: CLIP_GENERATION }`
- Checks cache: `Clip` exists for `(episodeId, durationTier)` with status COMPLETED → step SKIPPED
- If not cached: generates narrative + TTS, stores in R2 → step COMPLETED
- Reports `{ requestId, action: "job-stage-complete", jobId }` to ORCHESTRATOR_QUEUE

### Queue Message Shapes (revised 2026-03-04)

All stage messages now carry `jobId`. The job record is the source of truth for context (requestId, episodeId, durationTier).

```typescript
// Transcription
{ jobId: string; episodeId: string }

// Distillation
{ jobId: string; episodeId: string }

// Clip Generation
{ jobId: string; episodeId: string; durationTier: number }

// Orchestrator
{ requestId: string; action: "evaluate" | "job-stage-complete"; jobId?: string }
```

## Feed Refresh Changes

### Remove auto-chain

Delete lines 109-115 in `worker/queues/feed-refresh.ts`:

```typescript
// REMOVE THIS BLOCK:
if (ep.transcriptUrl) {
  await env.DISTILLATION_QUEUE.send({
    episodeId: episode.id,
    transcriptUrl: ep.transcriptUrl,
  });
}
```

### Configurable episode limit

Replace hardcoded `MAX_NEW_EPISODES = 5` with:

```typescript
const maxEpisodes = await getConfig(prisma, "pipeline.feedRefresh.maxEpisodesPerPodcast", 5);
const recent = latestEpisodes(feed.episodes, maxEpisodes as number);
```

## New Queue Bindings (wrangler.jsonc)

```jsonc
{ "binding": "TRANSCRIPTION_QUEUE", "queue": "transcription" },
{ "binding": "ORCHESTRATOR_QUEUE", "queue": "orchestrator" }
```

Add to Env type in `worker/types.ts`.

## API Changes

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/requests` | List BriefingRequests with pagination, status filter |
| GET | `/api/admin/requests/:id` | Request detail with episode-level stage progress |
| POST | `/api/admin/pipeline/trigger/test-briefing` | Create test briefing request |

### Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/briefings/generate` | Creates BriefingRequest → orchestrator instead of direct assembly |
| GET | `/api/admin/pipeline/jobs` | Add `requestId` filter parameter |

## Admin UI

### New Page: /admin/requests (Request Manager)

- Table of BriefingRequests: status badge, user, target minutes, podcast count, created time
- Status badges: PENDING (grey), PROCESSING (blue pulse), COMPLETED (green), FAILED (red)
- Expandable row: episode-level progress tree showing each stage's status per episode
- "Test Briefing" button → form: multi-select podcasts from catalog, duration input, submit

### Request Detail (expanded row)

Each row maps to a PipelineJob, each sub-row maps to a PipelineStep:

```
Request #abc123 — 15 min — PROCESSING
├─ Job 1: "AI in 2026" (Lex Fridman) — tier 5
│   ├─ Transcription: ✅ SKIPPED (cached)
│   ├─ Distillation:  ✅ COMPLETED (8.1s, $0.02)
│   └─ Clip Gen:      ⏳ IN_PROGRESS
├─ Job 2: "Supply Chain" (Planet Money) — tier 5
│   ├─ Transcription: ✅ COMPLETED (2.3s)
│   ├─ Distillation:  ⏳ IN_PROGRESS
│   └─ Clip Gen:      ⬜ PENDING
├─ Job 3: "React 20" (Syntax) — tier 5
│   ├─ Transcription: ❌ FAILED (audio STT timeout)
│   ├─ Distillation:  ⬜ —
│   └─ Clip Gen:      ⬜ —
└─ Assembly:           ⬜ WAITING (2/3 jobs ready)
```

### Pipeline Page Enhancements

- Add `requestId` filter dropdown
- Transcription is now a real stage column with its own jobs
- Transcript inspector: click a transcription job → modal showing raw transcript text

### Configuration Page

- Add "Max Episodes per Podcast" number input under pipeline settings, bound to `pipeline.feedRefresh.maxEpisodesPerPodcast`

## File Change Summary

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Replace PipelineJob model, add PipelineStep, add PipelineStage/PipelineStepStatus enums, drop PipelineJobType, add relations |
| `wrangler.jsonc` | Add TRANSCRIPTION_QUEUE and ORCHESTRATOR_QUEUE bindings |
| `worker/types.ts` | Add TRANSCRIPTION_QUEUE and ORCHESTRATOR_QUEUE to Env |
| `worker/queues/orchestrator.ts` | Create PipelineJobs, manage stage advancement, trigger assembly on all-complete |
| `worker/queues/transcription.ts` | Create PipelineStep, check cache, add audio-to-text fallback (Whisper) |
| `worker/queues/distillation.ts` | Create PipelineStep, check cache |
| `worker/queues/clip-generation.ts` | Create PipelineStep, check cache |
| `worker/queues/briefing-assembly.ts` | Partial assembly support, ad pairing for free tier |
| `worker/queues/feed-refresh.ts` | Remove auto-chain, configurable episode limit |
| `worker/queues/index.ts` | Register new queue handlers |
| `worker/routes/admin/pipeline.ts` | Return job/step data, update filters |
| `worker/routes/admin/requests.ts` | Include job/step progress in request detail |
| `worker/routes/briefings.ts` | Modify /generate to create BriefingRequest → orchestrator |
| `worker/index.ts` | Mount new routes, register new queue consumers |
| `src/types/admin.ts` | Update PipelineJob/Step types, drop PipelineJobType |
| `src/pages/admin/pipeline.tsx` | Render new job structure with step detail |
| `src/pages/admin/requests.tsx` | Render job progress tree from PipelineJob/Step data |
| `src/pages/admin/configuration.tsx` | Add max episodes per podcast setting |
| `worker/lib/logger.ts` | Add `jobId` to log context |
| `App.tsx` | Add /admin/requests route |
| Tests | Update all queue handler tests, add job/step assertions |
