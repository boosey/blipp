# Pipeline Architecture

Blipp uses a **demand-driven pipeline** to transform podcast episodes into audio briefings. Only feed refresh runs on a cron schedule -- all other processing is triggered by user briefing requests.

## 5-Stage Pipeline

```
  [Cron]              [User Request]
    |                       |
    v                       v
+-------------+    +----------------+
| 1. Feed     |    | Orchestrator   |
|   Refresh   |    | (evaluate)     |
+-------------+    +-------+--------+
                           |
              Creates PipelineJobs per episode
                           |
            +--------------+--------------+
            |              |              |
            v              v              v
      +-----------+  +-----------+  +-----------+
      | 2. Trans- |  | 2. Trans- |  | 2. Trans- |   (parallel per job)
      |  cription |  |  cription |  |  cription |
      +-----+-----+  +-----+-----+  +-----+-----+
            |              |              |
            v              v              v
      +-----------+  +-----------+  +-----------+
      | 3. Distil-|  | 3. Distil-|  | 3. Distil-|
      |   lation  |  |   lation  |  |   lation  |
      +-----+-----+  +-----+-----+  +-----+-----+
            |              |              |
            v              v              v
      +-----------+  +-----------+  +-----------+
      | 4. Clip   |  | 4. Clip   |  | 4. Clip   |
      |   Gen     |  |   Gen     |  |   Gen     |
      +-----+-----+  +-----+-----+  +-----+-----+
            |              |              |
            +--------------+--------------+
                           |
                  All jobs complete
                           |
                           v
                  +----------------+
                  | 5. Briefing    |
                  |    Assembly    |
                  +----------------+
                           |
                           v
                  Briefings created,
                  FeedItems READY
```

### Stage Details

| Stage | Queue | Description |
|-------|-------|-------------|
| 1. Feed Refresh | `feed-refresh` | Polls RSS feeds, ingests new episodes into the database |
| 2. Transcription | `transcription` | Three-tier waterfall: RSS feed URL → Podcast Index API → Whisper STT (with chunking for >25MB) |
| 3. Distillation | `distillation` | Uses Claude to extract scored claims from transcript |
| 4. Clip Generation | `clip-generation` | Generates narrative text + TTS audio for an (episode, durationTier) pair |
| 5. Briefing Assembly | `briefing-assembly` | Creates per-user Briefing records wrapping shared Clips, updates FeedItems to READY with briefingId |

---

## Orchestrator Pattern

**File:** `worker/queues/orchestrator.ts`

The orchestrator is a push-based coordinator sitting on the `orchestrator` queue. It handles two message types:

```
+-----------------+          +----------------+
| evaluate        |--------->| Resolve items  |
| (new request)   |          | to episodes,   |
|                 |          | create jobs,   |
|                 |          | dispatch to    |
|                 |          | transcription  |
+-----------------+          +----------------+

+-----------------+          +----------------+
| job-stage-      |--------->| Advance job to |
| complete        |          | next stage, or |
| (stage done)    |          | trigger assem- |
|                 |          | bly when all   |
|                 |          | jobs complete  |
+-----------------+          +----------------+
```

### Message Interface

```typescript
interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "job-stage-complete";
  jobId?: string;
}
```

### Stage Progression

Each queue handler reports back to `ORCHESTRATOR_QUEUE` when its stage completes for a job. The orchestrator advances the job through stages:

```
TRANSCRIPTION --> DISTILLATION --> CLIP_GENERATION --> (complete)
                                                          |
                                          When all jobs for a request complete:
                                                          |
                                                          v
                                                  BRIEFING_ASSEMBLY
```

---

## BriefingRequest Lifecycle

```
Subscription auto / On-demand / Admin test
         |
         v
     PENDING ------> evaluate message sent to orchestrator
         |
         v
    PROCESSING -----> orchestrator creates jobs, dispatches stages
         |
    +----+----+
    |         |
    v         v
COMPLETED   FAILED
    |
    v
Briefings created, FeedItems READY
```

- **Created by:** Subscription auto (feed refresh), on-demand (`POST /api/briefings/generate`), or admin test (`POST /api/admin/requests/test-briefing`)
- **Evaluate:** Orchestrator resolves request items (`useLatest` becomes actual `episodeId`), creates PipelineJobs
- **Completion:** When all jobs finish (or fail), assembly is dispatched
- **Assembly:** Creates per-user Briefing records (upsert on `userId + clipId`) wrapping shared Clips, then updates linked FeedItems to READY with `briefingId` on success, FAILED on failure

---

## PipelineJob Model

One job per **(episode, durationTier)** per request.

| Field | Description |
|-------|-------------|
| `currentStage` | Pipeline stage the job is at (TRANSCRIPTION, DISTILLATION, CLIP_GENERATION, BRIEFING_ASSEMBLY) |
| `status` | PENDING, IN_PROGRESS, COMPLETED, FAILED |
| `distillationId` | Link to cached distillation work product |
| `clipId` | Link to cached clip work product |
| `completedAt` | When job finished |

### Relationship to Request

```
BriefingRequest 1 ----> * PipelineJob
                           (one per episode + durationTier)

PipelineJob 1 ----> * PipelineStep
                       (one per stage execution, audit trail)
```

A digest-style request produces multiple jobs (one per episode). A single-episode request produces one job.

---

## PipelineStep Model (Audit Trail)

One step per stage execution per job. Provides full observability into pipeline behavior.

| Field | Description |
|-------|-------------|
| `stage` | Which pipeline stage |
| `status` | PENDING, IN_PROGRESS, COMPLETED, SKIPPED, FAILED |
| `cached` | Whether this step reused cached data |
| `startedAt` / `completedAt` | Timing |
| `durationMs` | Execution time |
| `cost` | API cost for this step (for analytics) |
| `retryCount` | Number of retries attempted |
| `workProductId` | Link to WorkProduct if one was created |
| `input` / `output` | JSON blobs for debugging |

---

## Stage Caching Strategy

Each stage checks for existing work products before doing expensive processing:

```
Stage 2 (Transcription):
  Has Distillation with transcript? --> SKIP
  Episode has transcriptUrl?        --> Fetch from URL (Tier 1: RSS feed)
  Podcast has podcastIndexId?       --> Lookup via Podcast Index API (Tier 2)
    Found? --> Fetch transcript, backfill episode.transcriptUrl
  Neither?                          --> Whisper STT (Tier 3)
    Audio > 25MB and MP3?           --> Chunked transcription (~20MB byte-range chunks)
    Audio > 25MB and non-MP3?       --> Fail with clear error
    Audio ≤ 25MB?                   --> Single-file transcription

Stage 3 (Distillation):
  Completed Distillation exists for episode? --> SKIP
  Otherwise                                  --> Run Claude extraction

Stage 4 (Clip Generation):
  Completed Clip exists for (episodeId, durationTier)? --> SKIP
  Otherwise                                            --> Generate narrative + TTS
```

When a stage is skipped, the handler creates a PipelineStep with `status: SKIPPED` and `cached: true`, then immediately reports completion to the orchestrator.

---

## Stage Gating (Runtime Config)

Each stage handler checks its enable flag before processing:

```
Message arrives at queue handler
         |
         v
  Is pipeline.stage.N.enabled? ----NO----> Ack message (discard)
         |
        YES
         |
         v
  Is message type "manual"? ----YES----> Bypass gate, process anyway
         |
         NO
         |
         v
  Process normally
```

This allows admins to disable individual stages without losing queued messages. Admin-triggered reprocessing (with `type: "manual"`) always bypasses the gate.

---

## WorkProduct Registry

Work products are stored in **R2** and tracked in the database.

### Model

```
WorkProduct {
  id           String
  type         WorkProductType  // TRANSCRIPT, CLAIMS, NARRATIVE, AUDIO_CLIP, BRIEFING_AUDIO
  episodeId    String?
  userId       String?
  durationTier Int?
  voice        String?
  r2Key        String (unique)
  sizeBytes    Int?
  metadata     Json?
}
```

### R2 Key Scheme

| Type | Key Pattern |
|------|-------------|
| Transcript | `transcripts/{episodeId}.txt` |
| Claims | `claims/{episodeId}.json` |
| Narrative | `narratives/{episodeId}/{durationTier}.txt` |
| Audio Clip | `clips/{episodeId}/{durationTier}.mp3` |
| Briefing | `briefings/{userId}/{requestId}.mp3` |

---

## Runtime Config Keys

Stored in the `PlatformConfig` table, accessed via `getConfig(prisma, key, fallback)` with a 60-second TTL cache.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pipeline.enabled` | boolean | `true` | Master pipeline kill switch |
| `pipeline.minIntervalMinutes` | number | `60` | Minimum interval between auto feed refreshes |
| `pipeline.lastAutoRunAt` | string | `null` | Timestamp of last auto run |
| `pipeline.stage.1.enabled` | boolean | `true` | Feed Refresh stage enable |
| `pipeline.stage.2.enabled` | boolean | `true` | Transcription stage enable |
| `pipeline.stage.3.enabled` | boolean | `true` | Distillation stage enable |
| `pipeline.stage.4.enabled` | boolean | `true` | Clip Generation stage enable |
| `pipeline.stage.5.enabled` | boolean | `true` | Briefing Assembly stage enable |
| `pipeline.feedRefresh.maxEpisodesPerPodcast` | number | `10` | Episode cap per podcast per refresh |
| `ai.stt.model` | string | `"whisper-1"` | Whisper STT model |
| `ai.distillation.model` | string | `"claude-sonnet-4-20250514"` | Claude model for claim extraction |
| `ai.narrative.model` | string | `"claude-sonnet-4-20250514"` | Claude model for narrative generation |
| `ai.tts.model` | string | `"gpt-4o-mini-tts"` | TTS model for audio generation |

---

## Queue Configuration

Defined in `wrangler.jsonc`.

| Queue | Batch Size | Max Retries | Purpose |
|-------|-----------|-------------|---------|
| `feed-refresh` | 10 | 3 | RSS polling |
| `transcription` | 5 | 3 | Transcript fetching/generation |
| `distillation` | 5 | 3 | Claude claim extraction |
| `clip-generation` | 3 | 3 | Narrative + TTS |
| `briefing-assembly` | 5 | 3 | Final audio assembly |
| `orchestrator` | 10 | 3 | Pipeline coordination |

---

## Cost Tracking

Each `PipelineStep` records AI usage metadata on completion:

- **model** (String?) — The AI model used (e.g. `whisper-1`, `claude-sonnet-4-20250514`, or `model1+model2` for multi-model stages like clip generation)
- **inputTokens** (Int?) — Input tokens consumed (for Whisper, estimated from audio bytes / 16000; for TTS, text character count)
- **outputTokens** (Int?) — Output tokens produced (0 for STT and TTS)
- **cost** (Float?) — Estimated dollar cost (null when not yet calculable)

Per-stage behavior:
- **Transcription:** Captured only for Whisper STT (Tier 3). Tiers 1/2 (RSS/Podcast Index) leave usage fields null since no AI call is made.
- **Distillation:** Captures Claude API usage from claim extraction. Model, input/output tokens come directly from the Anthropic response.
- **Clip Generation:** Combines narrative (Claude) + TTS (OpenAI) usage. Model field is `narrativeModel+ttsModel`, tokens are summed.

The admin Analytics page includes a per-model cost breakdown widget (`GET /api/admin/analytics/costs/by-model`) for monitoring spend across models and stages.

---

## Error Handling

```
Queue handler receives message
         |
         v
  try { process stage }
         |
    +----+----+
    |         |
 Success    Error
    |         |
    v         v
 Update    Update job
 job to    status to
 complete  FAILED
    |         |
    v         v
 Report    Retry message
 to orch.  (up to max_retries)
```

Key behaviors:

- **Request-existence guards:** Orchestrator checks if the BriefingRequest still exists before processing. Stale messages for deleted requests are acked and discarded.
- **Partial assembly:** If some jobs fail, assembly proceeds with the successful ones rather than failing the entire request.
- **Retry budget:** Each queue has `max_retries: 3`. After exhausting retries, the message is dead-lettered.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `worker/queues/orchestrator.ts` | Push-based pipeline coordinator |
| `worker/queues/transcription.ts` | Stage 2: three-tier transcript waterfall |
| `worker/lib/transcript-source.ts` | Podcast Index transcript lookup helper |
| `worker/lib/whisper-chunked.ts` | Chunked Whisper for oversized audio files |
| `worker/lib/ai-models.ts` | AI model registry + `getModelConfig()` helper |
| `worker/queues/distillation.ts` | Stage 3: Claude claim extraction |
| `worker/queues/clip-generation.ts` | Stage 4: narrative + TTS |
| `worker/queues/briefing-assembly.ts` | Stage 5: Briefing creation + FeedItem linking |
| `worker/queues/feed-refresh.ts` | Stage 1: RSS polling |
| `worker/lib/config.ts` | Runtime config helper with TTL cache |
| `worker/index.ts` | Worker entry point (queue routing) |
