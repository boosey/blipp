# Pipeline Architecture

Blipp turns a `BriefingRequest` into a personal audio briefing by passing each requested episode + duration tier through five deterministic stages. The pipeline is **demand-driven** — feed refresh is the only piece that runs on a schedule, and the rest only fires when a user (or an admin test / catalog pre-gen / SEO backfill) asks for a briefing.

## Overview

![Pipeline flow](./diagrams/pipeline-flow.svg)

- Input: `BriefingRequest` rows on `ORCHESTRATOR_QUEUE` (action `evaluate`).
- Output: `Briefing` + `FeedItem(status: READY)` for each successfully processed `PipelineJob`; failures surface as `FeedItem(status: FAILED)` and the request as `COMPLETED_DEGRADED` or `FAILED`.

## Stages

| # | Stage | Queue binding | Cloudflare queue | Handler | Writes |
|---|-------|----------------|-------------------|---------|--------|
| 1 | Transcription | `TRANSCRIPTION_QUEUE` | `transcription` | `worker/queues/transcription.ts` | `WorkProduct(TRANSCRIPT)` · `Distillation.transcript` |
| 2 | Distillation | `DISTILLATION_QUEUE` | `distillation` | `worker/queues/distillation.ts` | `WorkProduct(CLAIMS)` · `Distillation.claimsJson` |
| 3 | Narrative Generation | `NARRATIVE_GENERATION_QUEUE` | `narrative-generation` | `worker/queues/narrative-generation.ts` | `WorkProduct(NARRATIVE)` · `Clip.narrativeText` |
| 4 | Audio Generation (TTS) | `AUDIO_GENERATION_QUEUE` | `clip-generation` | `worker/queues/audio-generation.ts` | `WorkProduct(AUDIO_CLIP)` · `Clip.audioKey` · `Clip.status=COMPLETED` |
| 5 | Briefing Assembly | `BRIEFING_ASSEMBLY_QUEUE` | `briefing-assembly` | `worker/queues/briefing-assembly.ts` | `Briefing` · `FeedItem.briefingId` · `FeedItem.status=READY` |

> The `AUDIO_GENERATION_QUEUE` binding maps to the queue name `clip-generation` in `wrangler.jsonc` — a legacy name preserved for backwards-compatible logs and telemetry. The dispatcher normalises `clip-generation` → `handleAudioGeneration`.

Standalone jobs that are **not** pipeline stages:

| Job | Queue | Trigger | Purpose |
|-----|-------|---------|---------|
| Feed Refresh | `feed-refresh` | `episode-refresh` cron (every 5 min heartbeat, per-job interval gate) + admin | RSS polling → upsert `Episode` → fanout to `content-prefetch` → auto-create `BriefingRequest(source: SUBSCRIPTION)` for users subscribed to the podcast |
| Content Prefetch | `content-prefetch` | Feed refresh | HEAD probe audio, verify/fetch transcript, stamp `Episode.contentStatus` |
| Catalog Refresh | `catalog-refresh` | `apple-discovery` / `podcast-index-discovery` crons + admin | Pull trending/top-200 lists → upsert `Podcast` → queue feed refresh |
| Welcome Email | `welcome-email` | Clerk `user.created` webhook | Send ZeptoMail template; gated by `welcomeEmail.enabled` |

## Orchestrator

`worker/queues/orchestrator.ts` coordinates the whole pipeline. It is a push-based CAS controller — every stage completion comes back to it so it can advance the job.

![Orchestrator states](./diagrams/orchestrator-states.svg)

### Message types

```ts
type OrchestratorMessage = {
  requestId: string;
  action: "evaluate" | "job-stage-complete" | "job-failed";
  jobId?: string;
  completedStage?: "TRANSCRIPTION" | "DISTILLATION" | "NARRATIVE_GENERATION" | "AUDIO_GENERATION";
  correlationId?: string;
  errorMessage?: string;
};
```

### `evaluate` (new request)

1. Load `BriefingRequest`. Skip if terminal.
2. If `request.mode === "USER"`, enforce `Plan.concurrentPipelineJobs` via `checkConcurrentJobLimit`. Over-limit requests are **re-queued** (`msg.retry()`) so they resume when a slot frees up.
3. Resolve `useLatest` items to the podcast's most recent `Episode`; drop items that don't resolve.
4. Cap `durationTier` against episode length. If the episode is shorter than the requested tier, pick the next-lower `DURATION_TIERS` entry that still fits, and update any already-created `FeedItem` rows at the original tier to the new tier (merging with any conflicting existing `FeedItem`).
5. Mark request `PROCESSING`.
6. **Cache-aware entry** — with two batch queries (one on `WorkProduct`, one on `Clip`) determine the earliest stage that still needs work for each item:
   - `AUDIO_CLIP` + `Clip.status=COMPLETED` → `BRIEFING_ASSEMBLY` (pure cache hit; no pipeline message sent until all jobs are ready).
   - `NARRATIVE` → `AUDIO_GENERATION`.
   - `CLAIMS` → `NARRATIVE_GENERATION`.
   - `TRANSCRIPT` → `DISTILLATION`.
   - Otherwise → `TRANSCRIPTION`.
7. Create a `PipelineJob` per item with the computed `currentStage` and dispatch the stage's queue message.
8. If **every** job is fully cached, dispatch briefing assembly immediately (no stage-complete messages will otherwise arrive).

### `job-stage-complete`

1. Load `PipelineJob`. Skip if terminal or if the reported `completedStage` is earlier than `currentStage` (out-of-order duplicate).
2. **CAS advance** — `updateMany({ where: { id, currentStage: completedStage }, data: { currentStage: nextStage, status: "IN_PROGRESS" } })`. Only one concurrent handler wins.
3. Dispatch the next stage's queue message.
4. On stage 4 (`AUDIO_GENERATION`) completion, park the job at `currentStage=BRIEFING_ASSEMBLY, status=PENDING`. When no jobs remain in stages 1–4 (all are FAILED or parked), dispatch `BRIEFING_ASSEMBLY_QUEUE`.
5. SEO-backfill mode: mark the job `COMPLETED` after `DISTILLATION` and skip stages 3–5. When all jobs for the request are terminal, mark the request `COMPLETED` (if any succeeded) or `FAILED`.

### `job-failed`

1. Mark the job `FAILED` with the error message.
2. If no jobs are still in stages 1–4 (everything is either FAILED or parked at `BRIEFING_ASSEMBLY` PENDING), dispatch assembly so the surviving jobs can still ship as `COMPLETED_DEGRADED`.

### Invariants

- Strict stage order: `TRANSCRIPTION → DISTILLATION → NARRATIVE_GENERATION → AUDIO_GENERATION → BRIEFING_ASSEMBLY`.
- CAS on `currentStage=completedStage` means duplicate queue deliveries cannot double-advance a job.
- `BriefingRequest.mode` is enforced at `evaluate` time (`USER` vs `SEO_BACKFILL` vs `CATALOG`).
- Terminal request statuses: `COMPLETED`, `COMPLETED_DEGRADED`, `FAILED`, `CANCELLED`.

## Stage Details

### Stage 1 — Transcription (`worker/queues/transcription.ts`)

Three-tier waterfall, walked top-to-bottom. The order is configurable via `transcript.sources` (`PlatformConfig`, default `["rss-feed", "podcast-index"]`); STT is always the final fallback.

1. **RSS feed transcript URL** (`transcript/sources.ts`) — fetch + normalise VTT/SRT; caches to R2 on success.
2. **Podcast Index lookup** (`transcript/podcast-index-source.ts`) — HMAC-SHA1 query against `/episodes/byguid`; falls through when the response has no transcript.
3. **STT fallback** (`worker/lib/stt/*`) — model chain from `resolveModelChain(prisma, "stt")`. Each provider is tried in primary/secondary/tertiary order with per-provider circuit breaker skip:
   - Audio probed via HEAD + first 12 bytes to detect format, size, duration.
   - Files are chunked when they exceed the provider's `maxFileSizeBytes` limit (OpenAI ≈15 MB, Groq ≤25 MB, Cloudflare Whisper 5 MB with Base64 encoding; Deepgram accepts URL references directly).
   - Transient failures (HTTP 504, 1031, network errors) increment the circuit-breaker failure counter and fall through to the next provider.
   - On success, `recordSuccess(provider)` closes the circuit; on failure, `writeAiError()` logs an `AiServiceError` row with classification (`rate_limit`, `timeout`, `auth`, `content_filter`, …).

Outputs: `WorkProduct(TRANSCRIPT)` at `wp/transcript/{episodeId}.txt`; `Distillation` row upserted to `TRANSCRIPT_READY` status. Sends `OrchestratorMessage(action: "job-stage-complete", completedStage: "TRANSCRIPTION")`.

### Stage 2 — Distillation (`worker/queues/distillation.ts`)

1. Cache hit on `WorkProduct(CLAIMS)` → short-circuit and report complete.
2. Load transcript from R2.
3. `resolveModelChain(prisma, "distillation")` → Anthropic Claude by default. Prompt caching via `cacheSystemPrompt` option; cache tokens reported separately in `PipelineStep`.
4. On a `NotAPodcastError` (detected song-lyrics claims), invalidate the podcast (`Podcast.invalidationReason = "song_lyrics_detected"`) and surface `MUSIC_FEED_ITEM_ERROR` back through the orchestrator.
5. On 429, back off with `pipeline.distillation.rateLimitRetries`.
6. **Auto-publish**: if the podcast is `deliverable=true`, set `Episode.publicPage=true` so the SEO page (`/p/...`) can render immediately.

Outputs: `WorkProduct(CLAIMS)` at `wp/claims/{episodeId}.json`; `Distillation.status=COMPLETED` with `claimsJson`.

### Stage 3 — Narrative Generation (`worker/queues/narrative-generation.ts`)

1. Cache hit on `WorkProduct(NARRATIVE, episodeId, durationTier)` → short-circuit.
2. Load claims from R2.
3. Clamp `durationTier` against episode length; select a claims subset for the effective duration.
4. `resolveModelChain(prisma, "narrative")` → LLM produces a narrative script with template variables substituted (`{{variable}}` syntax; see `worker/lib/prompt-defaults.ts`).
5. Upsert `Clip` record at `(episodeId, durationTier, voicePresetId)` with `wordCount` + `narrativeText` so the public page can render text even if audio generation fails.

Outputs: `WorkProduct(NARRATIVE)` at `wp/narrative/{episodeId}/{durationTier}.txt`.

### Stage 4 — Audio Generation / TTS (`worker/queues/audio-generation.ts`)

1. Cache hit on `WorkProduct(AUDIO_CLIP, episodeId, durationTier, voice)` + `Clip.status=COMPLETED` → short-circuit.
2. Resolve the voice preset (`VoicePreset.config.{openai|groq|cloudflare}`) or fall back to `audio.defaultVoice` (`coral`).
3. `resolveModelChain(prisma, "tts")` → for each candidate model/provider:
   - Chunk the narrative text to stay under the provider's character budget.
   - Call `generateSpeech(chunk)` with provider-specific options (voice, instructions, speed — OpenAI only).
   - Concatenate chunks with a silent MP3 frame to avoid splice artifacts.
   - If a provider rejects the input size, defensively re-chunk smaller and retry.
   - Voice degradation: if the primary model+voice fails but a secondary provider has a suitable fallback voice, mark `Clip.voiceDegraded=true` and record it in the step's output metadata.
4. Write MP3 to R2 and update `Clip` (`audioKey`, `audioContentType`, `actualSeconds`, `status=COMPLETED`).
5. Auto-publish mirrors stage 2.

Outputs: `WorkProduct(AUDIO_CLIP)` at `wp/clip/{episodeId}/{durationTier}/{voice}.mp3`.

### Stage 5 — Briefing Assembly (`worker/queues/briefing-assembly.ts`)

`handleBriefingAssembly` delegates to the shared `assembleBriefings(prisma, requestId, log)` in `worker/lib/briefing-assembly.ts`:

1. Load every `FeedItem` for the request, grouped by `(episodeId, durationTier, voicePresetId)`.
2. For each group, find the matching `Clip` row (already `COMPLETED`).
3. Upsert a `Briefing(userId, clipId)` — unique constraint guarantees one briefing per user per clip.
4. Set `FeedItem.briefingId` + `FeedItem.status=READY`.
5. On jobs that failed earlier: set their `FeedItem.status=FAILED` with `errorMessage`.
6. Roll up the `BriefingRequest.status`:
   - All jobs succeeded → `COMPLETED`.
   - Any succeeded, some failed → `COMPLETED_DEGRADED`.
   - None succeeded → `FAILED`.

Intro/outro jingles are **not** concatenated server-side. The web and native players stitch the intro + clip + outro client-side using the jingle audio assets at `/api/assets/jingles/*` (cached with Cache API). See [docs/decisions/2026-03-15-client-side-jingles.md](./decisions/2026-03-15-client-side-jingles.md).

## WorkProduct R2 Keys

Deterministic keys let cache hits be detected without reading the object:

| Type | Key | Stage |
|------|-----|-------|
| `TRANSCRIPT` | `wp/transcript/{episodeId}.txt` | Transcription |
| `CLAIMS` | `wp/claims/{episodeId}.json` | Distillation |
| `NARRATIVE` | `wp/narrative/{episodeId}/{durationTier}.txt` | Narrative Gen |
| `AUDIO_CLIP` | `wp/clip/{episodeId}/{durationTier}/{voice}.mp3` | Audio Gen |
| `SOURCE_AUDIO` | `wp/source-audio/{episodeId}.bin` | Transcription (debug; gated) |
| `BRIEFING_AUDIO` | reserved enum (no key builder today) | — |
| `DIGEST_NARRATIVE` · `DIGEST_CLIP` · `DIGEST_AUDIO` | digest-specific keys | Daily digest delivery |

Key builder: `wpKey(params)` in `worker/lib/work-products.ts`.

## Runtime Configuration

Pipeline-relevant `PlatformConfig` keys (60-second TTL cache):

| Key | Default | Effect |
|-----|---------|--------|
| `pipeline.enabled` | `true` | Global kill switch. Queue handlers ACK without processing when false. |
| `pipeline.logLevel` | `"info"` | `error` / `info` / `debug` applied by `createPipelineLogger`. |
| `pipeline.stage.{STAGE}.enabled` | `true` | Per-stage kill switch. Skipped by `checkStageEnabled`. Manual messages (`type: "manual"`) bypass this gate. |
| `pipeline.feedRefresh.maxEpisodesPerPodcast` | `5` | Cap on episodes ingested per poll. |
| `pipeline.feedRefresh.batchConcurrency` | `10` | Podcasts processed in parallel per feed-refresh message. |
| `pipeline.feedRefresh.fetchTimeoutMs` | `10000` | RSS fetch timeout. |
| `pipeline.feedRefresh.maxRetries` | `3` | Per-podcast retry budget (exponential backoff inside the queue). |
| `pipeline.contentPrefetch.fetchTimeoutMs` | `15000` | Audio / transcript probe timeout. |
| `pipeline.distillation.rateLimitRetries` | `3` | Retries on LLM 429s. |
| `transcript.sources` | `["rss-feed", "podcast-index"]` | Ordered non-STT transcript sources. |
| `ai.{stage}.model` · `ai.{stage}.model.secondary` · `ai.{stage}.model.tertiary` | — | Primary/secondary/tertiary `{provider, model}` per stage. |
| `prompt.*` | — | Prompt-template overrides (distillation, narrative). |
| `circuitBreaker.{failureThreshold,cooldownMs,windowMs}` | `5 / 30_000 / 60_000` | Per-provider circuit breaker parameters. |
| `audio.defaultVoice` | `"coral"` | Default TTS voice. |
| `audio.wordsPerMinute` | `150` | Speaking-rate assumption for duration estimation. |

## Multi-Provider Failover

Every AI call follows the same pattern (`worker/lib/model-resolution.ts`):

1. `resolveStageModel()` → read `ai.{stage}.model` from config, join against `AiModelProvider` for pricing/limits.
2. Check the per-provider circuit breaker — if open, `resolveStageModel` transparently fails over to an alternative provider serving the same model, logs `provider_failover`.
3. `resolveModelChain()` returns primary/secondary/tertiary as a list; queue handlers walk the list, recording `recordSuccess(provider)` / `recordFailure(provider)` after each attempt.

Circuit-breaker state is in-memory per Worker isolate and forgets failures outside `circuitBreaker.windowMs`.

Costs are aggregated from `PipelineStep` rows using pricing pulled from `AiModelProvider`:

- Tokens: `pricing.priceInputPerMToken * inputTokens / 1e6 + pricing.priceOutputPerMToken * outputTokens / 1e6`, with Anthropic cache adjustments (writes 1.25× input, reads 0.1× input).
- Audio (STT): `pricing.pricePerMinute * audioSeconds / 60`.
- Characters (TTS): `pricing.pricePerKChars * charCount / 1000`.

## Error Handling

- **Transient errors** (`rate_limit`, `timeout`, `server_error`, `network`) → `msg.retry()`, relying on Cloudflare Queues' exponential backoff up to the queue's `max_retries`. After the final retry, messages land on the queue's dead-letter (`dead-letter` or `feed-refresh-retry` for feed-refresh).
- **Permanent errors** (`auth`, `model_not_found`, `content_filter`, `invalid_request`, `quota_exceeded`) → `msg.ack()` + orchestrator `job-failed` notification. The job is marked FAILED and surrounding jobs continue.
- **NotAPodcastError** (detected by distillation from song-lyric claims) → podcast-wide invalidation via `podcast-invalidation.ts`; surfaces as `MUSIC_FEED_ITEM_ERROR` so the client can render the correct empty state.
- **Assembly errors** are retried (`msg.retry()`). If retries exhaust, the shared dead-letter queue logs it and `FeedItem.status=FAILED` is already recorded.

## Observability

Every stage writes a `PipelineStep` row with:

- `stage`, `status`, `cached`, `startedAt`, `completedAt`, `durationMs`
- AI usage: `model`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `audioSeconds`, `charCount`, `cost`
- `retryCount`, `workProductId`
- `input` / `output` JSON for debugging

`writeEvent(prisma, stepId, level, message, data)` in `worker/lib/pipeline-events.ts` emits fine-grained `PipelineEvent` entries (DEBUG/INFO/WARN/ERROR) without blocking the handler.

`AiServiceError` captures every provider failure with correlationId = `requestId`, enabling end-to-end trace lookup in `/admin/ai-errors`.

## Admin Controls

- **Pipeline page** (`/admin/pipeline`) — live job browser with stage/status filters; retry + dismiss actions; manual per-stage triggers.
- **Requests page** (`/admin/requests`) — per-request tree of jobs → steps → events, with work-product previews.
- **DLQ monitor** (`/admin/dlq`) — read-only view of `dead-letter` queue drops.
- **Stage configuration** (`/admin/stage-configuration`) — edit stage model assignments, prompts, and per-stage enable flags.
- **Scheduled jobs** (`/admin/scheduled-jobs`) — enable/disable or manually trigger cron jobs (`episode-refresh`, `catalog-pregen`, etc.).
- **AI errors** (`/admin/ai-errors`) — searchable `AiServiceError` log with category/severity filters.

## Upstream Stage Coalescing

When a popular episode is delivered to subscribers across multiple voice presets or duration tiers, the orchestrator dispatches one queue message per `(episode, durationTier, voicePresetId)` group. All such messages traverse the same upstream stages — transcription and distillation — which are keyed only on `episodeId`. Without coordination, every message would pay for its own Whisper transcription and distillation LLM call.

To prevent this, the transcription and distillation handlers each acquire a CAS-based lock on the `Distillation` row before doing paid work.

**Lock fields:** `Distillation.transcriptionStartedAt`, `Distillation.distillationStartedAt`.

**Acquisition:** `claimEpisodeStage` in `worker/lib/queue-helpers.ts` runs an atomic `updateMany` filtered on the row's `status` and an `OR(field IS NULL, field < staleThreshold)` clause. Exactly one concurrent worker observes `count: 1`; the others observe `count: 0`.

**Collision behavior:** Workers that lose the race call `msg.retry({ delaySeconds: 30 })`. By the time the message is redelivered, the winning worker has typically finished and written R2; the retried worker hits the cache check at the top of the handler and skips paid work.

**Stale recovery:** If the winning worker crashes mid-stage, its lock becomes eligible for takeover after `STALE_LOCK_MS` (10 minutes), generously past worst-case healthy completion.

**Crash window:** A post-claim R2 re-check covers the case where a prior worker wrote R2 but died before updating `status`.

**Downstream stages** (narrative, audio) are already deduped by the `Clip` table's `@@unique([episodeId, durationTier, voicePresetId])` constraint, which matches the orchestrator's dispatch key — no concurrent producers are possible for the same clip.
