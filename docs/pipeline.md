# Pipeline Architecture

Blipp uses a **demand-driven pipeline** to transform podcast episodes into audio briefings. Only feed refresh runs on a cron schedule -- all other processing is triggered by user briefing requests.

## 6-Stage Pipeline

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
      | 4. Narr-  |  | 4. Narr-  |  | 4. Narr-  |
      |   ative   |  |   ative   |  |   ative   |
      |   Gen     |  |   Gen     |  |   Gen     |
      +-----+-----+  +-----+-----+  +-----+-----+
            |              |              |
            v              v              v
      +-----------+  +-----------+  +-----------+
      | 5. Audio  |  | 5. Audio  |  | 5. Audio  |
      |   Gen     |  |   Gen     |  |   Gen     |
      +-----+-----+  +-----+-----+  +-----+-----+
            |              |              |
            +--------------+--------------+
                           |
                  All jobs complete
                           |
                           v
                  +----------------+
                  | 6. Briefing    |
                  |    Assembly    |
                  +----------------+
                           |
                           v
                  Briefings created,
                  FeedItems READY
```

### Standalone Jobs

| Job | Queue | Description |
|-----|-------|-------------|
| Feed Refresh | `feed-refresh` | Polls RSS feeds, ingests new episodes into the database. Runs on cron, not part of the pipeline. |

### Pipeline Stage Details

| Stage | Queue | Config Key | Description |
|-------|-------|------------|-------------|
| 1. Transcription | `transcription` | `TRANSCRIPTION` | Three-tier waterfall: RSS feed URL -> Podcast Index API -> Whisper STT (with chunking for >25MB) |
| 2. Distillation | `distillation` | `DISTILLATION` | Uses LLM (multi-provider) to extract scored claims from transcript |
| 3. Narrative Generation | `narrative-generation` | `NARRATIVE_GENERATION` | Generates narrative text from distillation claims using LLM (multi-provider) |
| 4. Audio Generation | `clip-generation` (legacy name) | `AUDIO_GENERATION` | Converts narrative text to MP3 audio via TTS (multi-provider) |
| 5. Briefing Assembly | `briefing-assembly` | `BRIEFING_ASSEMBLY` | Creates per-user Briefing records wrapping shared Clips, updates FeedItems to READY with briefingId |

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
TRANSCRIPTION --> DISTILLATION --> NARRATIVE_GENERATION --> AUDIO_GENERATION --> (complete)
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
| `currentStage` | Pipeline stage the job is at (TRANSCRIPTION, DISTILLATION, NARRATIVE_GENERATION, AUDIO_GENERATION, BRIEFING_ASSEMBLY) |
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

PipelineStep 1 ----> * PipelineEvent
                        (structured log entries)
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
| `model` | AI model used (e.g. "claude-sonnet-4-20250514") |
| `inputTokens` / `outputTokens` | Token usage |
| `cost` | API cost for this step (for analytics) |
| `retryCount` | Number of retries attempted |
| `workProductId` | Link to WorkProduct if one was created |
| `input` / `output` | JSON blobs for debugging |

---

## PipelineEvent Model (Structured Logging)

Fine-grained event log entries per step. Written via `writeEvent()` from `worker/lib/pipeline-events.ts` (fire-and-forget -- errors are swallowed and logged to console so event writes never break stage processing).

| Field | Description |
|-------|-------------|
| `level` | DEBUG, INFO, WARN, ERROR |
| `message` | Human-readable event message |
| `data` | Structured JSON payload |
| `createdAt` | Event timestamp |

Indexed on `[stepId, createdAt]` for efficient retrieval.

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
  Otherwise                                  --> Run LLM extraction (multi-provider)

Stage 4 (Narrative Generation):
  NARRATIVE WorkProduct exists for (episodeId, durationTier)? --> SKIP
  Otherwise                                                   --> Generate narrative from claims (multi-provider)

Stage 5 (Audio Generation):
  Completed Clip + AUDIO_CLIP WorkProduct exists for (episodeId, durationTier)? --> SKIP
  Otherwise                                                                     --> Generate TTS audio (multi-provider)
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

## Multi-Provider AI Architecture

Pipeline stages use a pluggable provider architecture. Each stage reads its model+provider config from `PlatformConfig` via `getModelConfig(prisma, stage)`, which returns `{ provider: string, model: string }`.

### Provider Registries

| Stage | Registry | Providers |
|-------|----------|-----------|
| STT | `worker/lib/stt-providers.ts` | OpenAI (whisper-1), Deepgram (nova-2, nova-3), AssemblyAI, Google (chirp), Groq, Cloudflare Workers AI |
| LLM (distillation, narrative) | `worker/lib/llm-providers.ts` | Anthropic (Claude), Groq (Llama, Mixtral), Cloudflare Workers AI |
| TTS | `worker/lib/tts-providers.ts` | OpenAI (gpt-4o-mini-tts, tts-1, tts-1-hd), Groq (Orpheus), Cloudflare Workers AI |

### Model Registry (Database)

Models and providers are tracked in the `AiModel` and `AiModelProvider` tables:

- **AiModel**: `(stage, modelId)` unique — one entry per model per stage
- **AiModelProvider**: `(aiModelId, provider)` unique — one provider entry per model

Provider pricing metadata (per-minute, per-token, per-character) is stored and refreshed daily via `worker/lib/pricing-updater.ts`.

### Async Providers

Some STT providers (AssemblyAI, Google) are asynchronous — they return a job ID and require polling. The `SttProvider` interface supports an optional `poll()` method for this pattern.

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

Work product keys are built via `wpKey()` from `worker/lib/work-products.ts`:

| Type | Key Pattern |
|------|-------------|
| Transcript | `wp/transcript/{episodeId}.txt` |
| Claims | `wp/claims/{episodeId}.json` |
| Narrative | `wp/narrative/{episodeId}/{durationTier}.txt` |
| Audio Clip | `wp/clip/{episodeId}/{durationTier}/{voice}.mp3` |

Legacy clip audio also exists at `clips/{episodeId}/{durationTier}.mp3` (served by `/api/clips/` route).

---

## Runtime Config Keys

Stored in the `PlatformConfig` table, accessed via `getConfig(prisma, key, fallback)` with a 60-second TTL cache.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pipeline.enabled` | boolean | `true` | Master pipeline kill switch |
| `pipeline.minIntervalMinutes` | number | `60` | Minimum interval between auto feed refreshes |
| `pipeline.lastAutoRunAt` | string | `null` | Timestamp of last auto run |
| `pipeline.logLevel` | string | `"info"` | Structured log verbosity (error/info/debug) |
| `pipeline.stage.TRANSCRIPTION.enabled` | boolean | `true` | Transcription stage enable |
| `pipeline.stage.DISTILLATION.enabled` | boolean | `true` | Distillation stage enable |
| `pipeline.stage.NARRATIVE_GENERATION.enabled` | boolean | `true` | Narrative Generation stage enable |
| `pipeline.stage.AUDIO_GENERATION.enabled` | boolean | `true` | Audio Generation stage enable |
| `pipeline.stage.BRIEFING_ASSEMBLY.enabled` | boolean | `true` | Briefing Assembly stage enable |
| `pipeline.feedRefresh.maxEpisodesPerPodcast` | number | `10` | Episode cap per podcast per refresh |
| `ai.stt.model` | JSON | `null` | STT model+provider config: `{provider, model}` |
| `ai.distillation.model` | JSON | `null` | Distillation LLM model+provider config |
| `ai.narrative.model` | JSON | `null` | Narrative LLM model+provider config |
| `ai.tts.model` | JSON | `null` | TTS model+provider config |
| `pricing.lastRefreshedAt` | string | `null` | Daily pricing refresh timestamp |

---

## Queue Configuration

Defined in `wrangler.jsonc`.

| Queue | Batch Size | Max Retries | Purpose |
|-------|-----------|-------------|---------|
| `feed-refresh` | 10 | 3 | RSS polling |
| `transcription` | 5 | 3 | Transcript fetching/generation |
| `distillation` | 5 | 3 | LLM claim extraction |
| `narrative-generation` | 5 | 3 | LLM narrative writing |
| `clip-generation` | 3 | 3 | TTS audio rendering (legacy queue name for audio generation) |
| `briefing-assembly` | 5 | 3 | Final audio assembly |
| `orchestrator` | 10 | 3 | Pipeline coordination |

---

## Cost Tracking

Each `PipelineStep` records AI usage metadata on completion:

- **model** (String?) — The AI model used (e.g. `whisper-1`, `claude-sonnet-4-20250514`, or `model1+model2` for multi-model stages)
- **inputTokens** (Int?) — Input tokens consumed (for Whisper, estimated from audio bytes / 16000; for TTS, text character count)
- **outputTokens** (Int?) — Output tokens produced (0 for STT and TTS)
- **cost** (Float?) — Estimated dollar cost (null when not yet calculable)

Per-stage behavior:
- **Transcription:** Captured only for Whisper STT (Tier 3). Tiers 1/2 (RSS/Podcast Index) leave usage fields null since no AI call is made.
- **Distillation:** Captures LLM API usage from claim extraction. Model, input/output tokens come directly from the API response.
- **Narrative Generation:** Captures LLM API usage from narrative writing. Model and token counts from the API response.
- **Audio Generation:** Captures TTS API usage. Model and token counts from the API response.

The admin Analytics page includes a per-model cost breakdown widget (`GET /api/admin/analytics/costs/by-model`) for monitoring spend across models and stages.

---

## Pipeline Logging

### Structured JSON Logger

The pipeline uses a structured JSON logger (`worker/lib/logger.ts`) with configurable verbosity via `pipeline.logLevel` PlatformConfig key.

Log levels: `error` (0) < `info` (1) < `debug` (2)

Each log line is JSON with: `{ level, stage, requestId?, jobId?, action, ...data, ts }`

### Pipeline Events (Database)

Fine-grained events within pipeline steps are written to the `PipelineEvent` table via `writeEvent()` from `worker/lib/pipeline-events.ts`. These provide step-level observability beyond what structured logs capture.

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
| `worker/queues/distillation.ts` | Stage 3: LLM claim extraction |
| `worker/queues/narrative-generation.ts` | Stage 4: LLM narrative writing |
| `worker/queues/audio-generation.ts` | Stage 5: TTS audio rendering |
| `worker/queues/briefing-assembly.ts` | Stage 6: Briefing creation + FeedItem linking |
| `worker/queues/feed-refresh.ts` | Stage 1: RSS polling |
| `worker/lib/stt-providers.ts` | Multi-provider STT interface |
| `worker/lib/llm-providers.ts` | Multi-provider LLM interface |
| `worker/lib/tts-providers.ts` | Multi-provider TTS interface |
| `worker/lib/ai-models.ts` | AI model config reader |
| `worker/lib/pipeline-events.ts` | Pipeline event writer |
| `worker/lib/work-products.ts` | R2 key builders |
| `worker/lib/transcript-source.ts` | Podcast Index transcript lookup helper |
| `worker/lib/whisper-chunked.ts` | Chunked Whisper for oversized audio files |
| `worker/lib/config.ts` | Runtime config helper with TTL cache |
| `worker/lib/logger.ts` | Structured JSON pipeline logger |
| `worker/index.ts` | Worker entry point (queue routing) |
