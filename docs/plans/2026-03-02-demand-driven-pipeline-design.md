# Demand-Driven Pipeline with Request Manager & Job Manager

**Date**: 2026-03-02
**Branch**: moonchild-admin-ui
**Status**: Approved

## Overview

Redesign the Blipp pipeline from auto-chaining to demand-driven. Only feed refresh runs automatically. All other stages (transcription, distillation, clip generation, briefing assembly) run on-demand when a user requests a briefing. A new orchestrator manages the lifecycle of each request through stages, and each stage reports back when complete.

## Architecture

### Core Concepts

- **Request Manager**: Handles user briefing requests. Checks if the requested product already exists or is in-progress. If neither, creates a pipeline job. Tracks the request to completion and responds to the user.
- **Job Manager**: Monitors individual pipeline jobs through queues, updates job status, and reports stage completion back to the orchestrator.
- **Orchestrator**: A Cloudflare Queue handler that receives "evaluate" and "stage-complete" messages. Evaluates what work is needed for a request, dispatches to stage queues, and advances when stages report back.

### Pipeline Stages

| # | Name | Queue | Trigger |
|---|------|-------|---------|
| 1 | Feed Refresh | FEED_REFRESH_QUEUE | Cron or manual |
| 2 | Transcription | TRANSCRIPTION_QUEUE (new) | On-demand (orchestrator) or manual |
| 3 | Distillation | DISTILLATION_QUEUE | On-demand (orchestrator) or manual |
| 4 | Clip Generation | CLIP_GENERATION_QUEUE | On-demand (orchestrator) or manual |
| 5 | Briefing Assembly | Handled by orchestrator | On-demand (orchestrator) |

## Data Model

### New: BriefingRequest

```prisma
model BriefingRequest {
  id            String               @id @default(cuid())
  userId        String
  status        BriefingRequestStatus @default(PENDING)
  targetMinutes Int
  podcastIds    String[]             // explicit podcast selection (test) or from subscriptions
  isTest        Boolean              @default(false)
  briefingId    String?              // populated when assembly completes
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

### Modified: PipelineJob

Add two fields:

```prisma
model PipelineJob {
  // ... existing fields ...
  requestId    String?   // links to BriefingRequest (null for manual/cron jobs)
  parentJobId  String?   // for job trees (request spawns multiple episode jobs)
}
```

### Modified: DistillationStatus

Add `TRANSCRIPT_READY` status:

```prisma
enum DistillationStatus {
  PENDING
  FETCHING_TRANSCRIPT    // kept for backward compat, now unused by new flow
  TRANSCRIPT_READY       // NEW: transcript fetched, ready for claim extraction
  EXTRACTING_CLAIMS
  COMPLETED
  FAILED
}
```

## Message Flow

### User Briefing Request

```
1. User → POST /briefings/generate
   → Creates BriefingRequest (PENDING)
   → Sends to ORCHESTRATOR_QUEUE: { requestId, action: "evaluate" }

2. Orchestrator receives { action: "evaluate" }:
   → Loads request, resolves target episodes (latest per podcast)
   → For each episode, checks what's needed:
     - No transcript? → TRANSCRIPTION_QUEUE, create PipelineJob
     - Has transcript, no distillation? → DISTILLATION_QUEUE, create PipelineJob
     - Has distillation, no clip for target tier? → CLIP_GENERATION_QUEUE, create PipelineJob
     - Has everything? → mark episode ready
   → If all episodes ready → assemble briefing immediately
   → Otherwise → update request status to PROCESSING, wait for callbacks

3. Stage handler completes work:
   → Updates Distillation/Clip record + PipelineJob status
   → Sends to ORCHESTRATOR_QUEUE: { requestId, action: "stage-complete", stage, episodeId }

4. Orchestrator receives { action: "stage-complete" }:
   → Re-evaluates the request's episode list
   → Dispatches next needed stage for that episode
   → If ALL episodes have all stages complete → assemble briefing → mark COMPLETED
```

### Admin Test Briefing

```
Admin → POST /admin/pipeline/trigger/test-briefing
  body: { podcastIds: [...], targetMinutes: 5 }
→ Creates BriefingRequest (isTest: true, userId: admin's userId)
→ Same orchestrator flow as above
```

### Cron Feed Refresh (unchanged)

```
Cron → FEED_REFRESH_QUEUE → polls RSS → upserts Episode rows → done
No auto-chaining to distillation.
```

### Manual Stage Triggers (unchanged)

```
Admin → POST /admin/pipeline/trigger/stage/:stage
→ Dispatches directly to stage queue with type: "manual"
→ No requestId, no orchestrator callback
→ Creates PipelineJob for observability
```

## Splitting Transcription from Distillation

### New: worker/queues/transcription.ts

- Receives `{ episodeId, transcriptUrl, requestId? }`
- Fetches transcript from URL
- Upserts Distillation record with `status: TRANSCRIPT_READY`, stores `transcript` text
- Creates/updates PipelineJob (stage: 2, type: TRANSCRIPTION)
- If `requestId` present: sends `{ requestId, action: "stage-complete", stage: 2, episodeId }` to ORCHESTRATOR_QUEUE

### Modified: worker/queues/distillation.ts

- Receives `{ episodeId, requestId? }` (no longer needs `transcriptUrl`)
- Loads Distillation record, reads `transcript` field
- If no transcript present → fails with error
- Runs claim extraction (Pass 1) via Claude
- Updates PipelineJob (stage: 3, type: DISTILLATION)
- If `requestId` present: sends `{ requestId, action: "stage-complete", stage: 3, episodeId }` to ORCHESTRATOR_QUEUE

### Modified: worker/queues/clip-generation.ts

- Existing behavior unchanged
- Add: if `requestId` present in message, report back to orchestrator after completion

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

```
Request #abc123 — 5 min — PROCESSING
├─ Episode: "AI in 2026" (Lex Fridman)
│   ├─ Transcription: ✅ COMPLETED (2.3s)
│   ├─ Distillation:  ✅ COMPLETED (8.1s)
│   └─ Clip Gen:      ⏳ IN_PROGRESS
├─ Episode: "Supply Chain" (Planet Money)
│   ├─ Transcription: ✅ COMPLETED (1.8s)
│   ├─ Distillation:  ⏳ IN_PROGRESS
│   └─ Clip Gen:      ⬜ WAITING
└─ Assembly:           ⬜ WAITING
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
| `prisma/schema.prisma` | Add BriefingRequest model, enhance PipelineJob, add TRANSCRIPT_READY status |
| `wrangler.jsonc` | Add TRANSCRIPTION_QUEUE and ORCHESTRATOR_QUEUE bindings |
| `worker/types.ts` | Add TRANSCRIPTION_QUEUE and ORCHESTRATOR_QUEUE to Env |
| `worker/queues/transcription.ts` | **New** — transcript fetching handler |
| `worker/queues/orchestrator.ts` | **New** — request lifecycle orchestrator |
| `worker/queues/feed-refresh.ts` | Remove auto-chain, configurable episode limit |
| `worker/queues/distillation.ts` | Remove transcript fetching, expect transcript present, add callback |
| `worker/queues/clip-generation.ts` | Add orchestrator callback |
| `worker/queues/index.ts` | Register new queue handlers, update scheduled handler if needed |
| `worker/routes/admin/pipeline.ts` | Add test-briefing endpoint |
| `worker/routes/admin/requests.ts` | **New** — request manager API routes |
| `worker/routes/briefings.ts` | Modify /generate to create BriefingRequest → orchestrator |
| `worker/index.ts` | Mount new routes, register new queue consumers |
| `src/pages/admin/requests.tsx` | **New** — Request Manager page |
| `src/pages/admin/pipeline.tsx` | Add request filter, transcript inspector |
| `src/pages/admin/configuration.tsx` | Add max episodes per podcast setting |
| `src/components/admin/pipeline-controls.tsx` | Test briefing button (if kept in controls) |
| `src/types/admin.ts` | Add BriefingRequest types, update stage types |
| `src/hooks/use-pipeline-config.ts` | Add max episodes config key |
| `App.tsx` | Add /admin/requests route |
| Tests | New tests for orchestrator, transcription handler, request routes, UI |
