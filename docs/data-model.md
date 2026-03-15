# Blipp Data Model Reference

Generated from `prisma/schema.prisma`. Current as of 2026-03-14.

## Entity Relationship Diagram

```
                         +----------------+
                         | PlatformConfig |
                         +----------------+

  +------+    +----------+    +----------+    +-------+
  | Plan |--->|   User   |--->| FeedItem |    |Podcast|
  +------+    +----------+    +----------+    +-------+
                 |   |             |               |
                 |   |        (briefingId)          |
                 |   |             |               |
                 |   |      +----------+           |
                 |   +----->| Briefing |           |
                 |   |      | (user+   |           |
                 |   |      |  clip)   |           |
                 |   |      +----------+           |
                 |   |             |               |
                 |   |      +----------+           |
                 |   |      | Briefing |           |
                 |   |      | Request  |           |
                 |   |      +----------+           |
                 |   |           |                 |
                 |   |      +----------+    +-----------+
                 |   |      | Pipeline |--->| Pipeline  |---> PipelineEvent
                 |   |      |   Job    |    |   Step    |
                 |   |      +----------+    +-----------+
                 |   |           |               |
                 |   |           v               v
                 |   |      +---------+    +------------+
                 |   +----->| Episode |<---| WorkProduct|
                 |          +---------+    +------------+
                 |               |
                 |          +----+----+
                 |          |         |
                 |          v         v
                 |   +---------+  +------+
                 |   |Distilla-|  | Clip |
                 |   |  tion   |->|      |
                 |   +---------+  +------+
                 |
                 +---------> Subscription <--------+

  +----------+     +------------------+     +-----------+
  | AiModel  |---->| AiModelProvider  |     | SttExper- |
  +----------+     +------------------+     |   iment   |
                                            +-----------+
                                                 |
                                            +----v-------+
                                            | SttBench-  |
                                            | markResult |
                                            +----+-------+
                                                 |
                                            Episode (FK)
```

### Key Relationships

```
Plan 1---* User
User 1---* Subscription *---1 Podcast
User 1---* Briefing *---1 Clip
User 1---* FeedItem *---1 Episode
User 1---* BriefingRequest
BriefingRequest 1---* PipelineJob *---1 Episode
PipelineJob 1---* PipelineStep *--? WorkProduct
PipelineStep 1---* PipelineEvent
Podcast 1---* Episode
Podcast 1---* FeedItem
Episode 1--? Distillation 1---* Clip
Episode 1---* Clip
Episode 1---* WorkProduct
Episode 1---* SttBenchmarkResult
FeedItem *--? Briefing (via briefingId)
Briefing *---1 Clip (shared content)
AiModel 1---* AiModelProvider
SttExperiment 1---* SttBenchmarkResult
```

Legend: `1---*` = one-to-many, `1--?` = one-to-zero-or-one, `*---1` = many-to-one

---

## Models

### Plan

Defines subscription plans with limits, feature flags, and Stripe billing integration. Plans are slug-based and support monthly + annual pricing.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| name | String | -- | Display name (e.g. "Free", "Pro Monthly") |
| slug | String | -- | URL-safe identifier (unique, e.g. "free", "pro-monthly") |
| description | String? | -- | Marketing copy |
| briefingsPerWeek | Int? | -- | Weekly briefing limit (null = unlimited) |
| maxDurationMinutes | Int | `5` | Maximum allowed duration tier in minutes |
| maxPodcastSubscriptions | Int? | -- | Podcast subscription limit (null = unlimited) |
| adFree | Boolean | `false` | Whether plan is ad-free |
| priorityProcessing | Boolean | `false` | Priority pipeline processing |
| earlyAccess | Boolean | `false` | Early access to new features |
| researchMode | Boolean | `false` | Research mode access |
| crossPodcastSynthesis | Boolean | `false` | Cross-podcast synthesis feature |
| priceCentsMonthly | Int | `0` | Monthly price in cents (0 = free) |
| stripePriceIdMonthly | String? | -- | Stripe Price ID for monthly billing (unique) |
| priceCentsAnnual | Int? | -- | Annual price in cents (null = no annual option) |
| stripePriceIdAnnual | String? | -- | Stripe Price ID for annual billing (unique) |
| stripeProductId | String? | -- | Stripe Product ID (unique) |
| trialDays | Int | `0` | Trial period in days |
| features | String[] | -- | Marketing bullet points for display |
| highlighted | Boolean | `false` | Whether to highlight in UI |
| active | Boolean | `true` | Whether plan is available |
| sortOrder | Int | `0` | Display ordering |
| isDefault | Boolean | `false` | Assigned to new users on creation |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `users` -> User[] (one-to-many)

**Constraints:**
- `slug` is unique
- `stripePriceIdMonthly` is unique
- `stripePriceIdAnnual` is unique
- `stripeProductId` is unique

---

### User

Authenticated user from Clerk with plan and billing info.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| clerkId | String | -- | Clerk user ID (unique) |
| email | String | -- | Email address (unique) |
| name | String? | -- | Display name |
| imageUrl | String? | -- | Profile image URL |
| stripeCustomerId | String? | -- | Stripe Customer ID (unique) |
| planId | String | -- | FK to Plan |
| isAdmin | Boolean | `false` | Admin access flag |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `plan` -> Plan (many-to-one)
- `subscriptions` -> Subscription[] (one-to-many)
- `briefings` -> Briefing[] (one-to-many)
- `feedItems` -> FeedItem[] (one-to-many)
- `briefingRequests` -> BriefingRequest[] (one-to-many)

**Constraints:**
- `clerkId` is unique
- `email` is unique
- `stripeCustomerId` is unique

---

### Podcast

A podcast feed tracked by the platform.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| title | String | -- | Podcast title |
| description | String? | -- | Podcast description |
| feedUrl | String | -- | RSS feed URL (unique) |
| imageUrl | String? | -- | Cover art URL |
| podcastIndexId | String? | -- | PodcastIndex.org ID (unique) |
| author | String? | -- | Podcast author |
| categories | String[] | -- | Category tags (PostgreSQL array) |
| lastFetchedAt | DateTime? | -- | Last successful feed fetch |
| feedHealth | String? | -- | Feed health status ("excellent"/"good"/"fair"/"poor"/"broken") |
| feedError | String? | -- | Last feed fetch error |
| episodeCount | Int | `0` | Cached episode count |
| status | String | `"active"` | Podcast status ("active"/"paused"/"archived") |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `episodes` -> Episode[] (one-to-many)
- `subscriptions` -> Subscription[] (one-to-many)
- `feedItems` -> FeedItem[] (one-to-many)

**Constraints:**
- `feedUrl` is unique
- `podcastIndexId` is unique

---

### Episode

A single episode from a podcast feed.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| podcastId | String | -- | FK to Podcast |
| title | String | -- | Episode title |
| description | String? | -- | Episode description/show notes |
| audioUrl | String | -- | Audio file URL |
| publishedAt | DateTime | -- | Publication date |
| durationSeconds | Int? | -- | Episode duration in seconds |
| guid | String | -- | RSS GUID for deduplication |
| transcriptUrl | String? | -- | Transcript URL from feed |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `podcast` -> Podcast (many-to-one, cascade delete)
- `distillation` -> Distillation? (one-to-zero-or-one)
- `clips` -> Clip[] (one-to-many)
- `feedItems` -> FeedItem[] (one-to-many)
- `pipelineJobs` -> PipelineJob[] (one-to-many)
- `workProducts` -> WorkProduct[] (one-to-many)
- `benchmarkResults` -> SttBenchmarkResult[] (one-to-many)

**Constraints:**
- `@@unique([podcastId, guid])` -- compound unique on podcast + GUID

---

### Distillation

Processed transcript and extracted claims for an episode. Acts as a cache -- once completed, subsequent pipeline runs reuse the result.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| episodeId | String | -- | FK to Episode (unique, 1:1) |
| status | DistillationStatus | `PENDING` | Processing status |
| transcript | String? | -- | Full transcript text |
| claimsJson | Json? | -- | Extracted claims as JSON |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `episode` -> Episode (one-to-one, cascade delete)
- `clips` -> Clip[] (one-to-many)

**Constraints:**
- `episodeId` is unique (enforces 1:1 with Episode)

---

### Clip

A generated audio clip for a specific episode at a specific duration tier.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| episodeId | String | -- | FK to Episode |
| distillationId | String | -- | FK to Distillation |
| durationTier | Int | -- | Target duration in minutes (1, 2, 3, 5, 7, 10, or 15) |
| status | ClipStatus | `PENDING` | Processing status |
| narrativeText | String? | -- | Generated narrative script |
| wordCount | Int? | -- | Word count of narrative |
| audioKey | String? | -- | R2 object key for audio |
| audioUrl | String? | -- | Public audio URL |
| actualSeconds | Int? | -- | Actual clip duration |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `episode` -> Episode (many-to-one, cascade delete)
- `distillation` -> Distillation (many-to-one, cascade delete)
- `briefings` -> Briefing[] (one-to-many)

**Constraints:**
- `@@unique([episodeId, durationTier])` -- one clip per episode per duration tier

---

### Subscription

Join table linking users to their subscribed podcasts, with a per-subscription duration tier.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| userId | String | -- | FK to User |
| podcastId | String | -- | FK to Podcast |
| durationTier | Int | -- | Briefing duration in minutes (1, 2, 3, 5, 7, 10, 15, or 30) |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `user` -> User (many-to-one, cascade delete)
- `podcast` -> Podcast (many-to-one, cascade delete)

**Constraints:**
- `@@unique([userId, podcastId])` -- one subscription per user per podcast

---

### Briefing

Per-user wrapper around a shared Clip. Links a user to a specific content clip and will carry personalized ad audio in the future.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| userId | String | -- | FK to User |
| clipId | String | -- | FK to Clip (shared content) |
| adAudioUrl | String? | -- | Personalized ad audio URL (null until ads ship) |
| adAudioKey | String? | -- | R2 key for ad audio |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `user` -> User (many-to-one, cascade delete)
- `clip` -> Clip (many-to-one, cascade delete)
- `feedItems` -> FeedItem[] (one-to-many)

**Constraints:**
- `@@unique([userId, clipId])` -- one briefing per user per clip

---

### FeedItem

Per-user delivery record. One entry in the user's feed, pointing to a Briefing (single episode) or Digest (future). Created by subscriptions (auto) or on-demand requests.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| userId | String | -- | FK to User |
| episodeId | String | -- | FK to Episode |
| podcastId | String | -- | FK to Podcast |
| briefingId | String? | -- | FK to Briefing (set when READY) |
| durationTier | Int | -- | Briefing duration in minutes |
| source | FeedItemSource | -- | SUBSCRIPTION or ON_DEMAND |
| status | FeedItemStatus | `PENDING` | Processing status |
| listened | Boolean | `false` | Whether user has listened |
| listenedAt | DateTime? | -- | When user listened |
| requestId | String? | -- | FK to BriefingRequest that triggered pipeline |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `user` -> User (many-to-one, cascade delete)
- `episode` -> Episode (many-to-one, cascade delete)
- `podcast` -> Podcast (many-to-one, cascade delete)
- `briefing` -> Briefing? (many-to-one)

**Constraints:**
- `@@unique([userId, episodeId, durationTier])` -- one feed item per user per episode per tier

---

### BriefingRequest

A request that drives the pipeline. Created by subscriptions (auto), on-demand requests, or admin tests.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| userId | String | -- | FK to User |
| status | BriefingRequestStatus | `PENDING` | Request lifecycle status |
| targetMinutes | Int | -- | Desired briefing length |
| items | Json | -- | Requested content (podcast/episode IDs) |
| isTest | Boolean | `false` | Whether this is an admin test request |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `user` -> User (many-to-one, cascade delete)
- `jobs` -> PipelineJob[] (one-to-many)

---

### PipelineJob

Tracks one episode + duration tier through the pipeline for a given request.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| requestId | String | -- | FK to BriefingRequest |
| episodeId | String | -- | FK to Episode |
| durationTier | Int | -- | Target clip duration in minutes |
| status | PipelineJobStatus | `PENDING` | Job lifecycle status |
| currentStage | PipelineStage | `TRANSCRIPTION` | Current processing stage |
| distillationId | String? | -- | Resolved Distillation ID |
| clipId | String? | -- | Resolved Clip ID |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |
| completedAt | DateTime? | -- | Completion timestamp |

**Relations:**
- `request` -> BriefingRequest (many-to-one, cascade delete)
- `episode` -> Episode (many-to-one, cascade delete)
- `steps` -> PipelineStep[] (one-to-many)

---

### PipelineStep

Audit trail for each stage a PipelineJob passes through.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| jobId | String | -- | FK to PipelineJob |
| stage | PipelineStage | -- | Which pipeline stage |
| status | PipelineStepStatus | `PENDING` | Step outcome |
| cached | Boolean | `false` | Whether result was from cache |
| input | Json? | -- | Stage input payload |
| output | Json? | -- | Stage output payload |
| errorMessage | String? | -- | Error details on failure |
| startedAt | DateTime? | -- | When processing began |
| completedAt | DateTime? | -- | When processing finished |
| durationMs | Int? | -- | Processing duration in ms |
| model | String? | -- | AI model used (e.g. "claude-sonnet-4-20250514") |
| inputTokens | Int? | -- | Input tokens consumed by AI call |
| outputTokens | Int? | -- | Output tokens produced by AI call |
| cost | Float? | -- | Estimated cost (API calls, etc.) |
| retryCount | Int | `0` | Number of retries |
| workProductId | String? | -- | FK to WorkProduct |
| createdAt | DateTime | `now()` | Record creation timestamp |

**Relations:**
- `job` -> PipelineJob (many-to-one, cascade delete)
- `workProduct` -> WorkProduct? (many-to-one)
- `events` -> PipelineEvent[] (one-to-many)

---

### PipelineEvent

Structured event log for pipeline step execution. Provides fine-grained observability into individual step behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| stepId | String | -- | FK to PipelineStep |
| level | PipelineEventLevel | -- | Event severity (DEBUG/INFO/WARN/ERROR) |
| message | String | -- | Human-readable event message |
| data | Json? | -- | Structured event data |
| createdAt | DateTime | `now()` | Event timestamp |

**Relations:**
- `step` -> PipelineStep (many-to-one, cascade delete)

**Constraints:**
- `@@index([stepId, createdAt])` -- composite index for efficient step event queries

---

### WorkProduct

Tracks artifacts stored in R2 (transcripts, audio clips, etc.).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| type | WorkProductType | -- | Artifact type |
| episodeId | String? | -- | FK to Episode (optional) |
| userId | String? | -- | Owning user ID (optional) |
| durationTier | Int? | -- | Duration tier if applicable |
| voice | String? | -- | TTS voice used |
| r2Key | String | -- | R2 object key (unique) |
| sizeBytes | Int? | -- | File size in bytes |
| metadata | Json? | -- | Additional metadata |
| createdAt | DateTime | `now()` | Record creation timestamp |

**Relations:**
- `episode` -> Episode? (many-to-one, cascade delete)
- `steps` -> PipelineStep[] (one-to-many, via PipelineStep.workProductId)

**Constraints:**
- `r2Key` is unique

---

### AiModel

Registry of AI models available for pipeline stages.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| stage | AiStage | -- | Pipeline stage (stt/distillation/narrative/tts) |
| modelId | String | -- | Model identifier (e.g. "whisper-1", "claude-sonnet-4-20250514") |
| label | String | -- | Display name (e.g. "Whisper v1") |
| developer | String | -- | Model developer (e.g. "openai", "anthropic") |
| notes | String? | -- | Capabilities, value notes, limitations |
| isActive | Boolean | `true` | Whether model is available for selection |
| createdAt | DateTime | `now()` | Record creation timestamp |

**Relations:**
- `providers` -> AiModelProvider[] (one-to-many)

**Constraints:**
- `@@unique([stage, modelId])` -- one entry per stage + model combination

---

### AiModelProvider

Provider-specific configuration for an AI model, including pricing and availability.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| aiModelId | String | -- | FK to AiModel |
| provider | String | -- | Inference provider (e.g. "openai", "cloudflare", "groq", "deepgram") |
| providerModelId | String? | -- | Provider-specific model ID (e.g. "@cf/openai/whisper") |
| providerLabel | String | -- | Display name (e.g. "Cloudflare Workers AI") |
| pricePerMinute | Float? | -- | STT/TTS per audio minute |
| priceInputPerMToken | Float? | -- | LLM per 1M input tokens |
| priceOutputPerMToken | Float? | -- | LLM per 1M output tokens |
| pricePerKChars | Float? | -- | TTS alt: per 1K characters |
| isDefault | Boolean | `false` | Whether this is the default provider for the model |
| isAvailable | Boolean | `true` | Whether provider is currently available |
| priceUpdatedAt | DateTime? | -- | Last pricing refresh timestamp |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
- `model` -> AiModel (many-to-one, cascade delete)

**Constraints:**
- `@@unique([aiModelId, provider])` -- one provider entry per model
- `@@index([aiModelId])` -- index for provider lookups

---

### SttExperiment

An STT benchmark experiment comparing models/providers/speeds.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| name | String | -- | Experiment name |
| status | SttExperimentStatus | `PENDING` | Experiment lifecycle |
| config | Json | -- | Configuration: `{ models, speeds, episodeIds }` |
| totalTasks | Int | `0` | Total benchmark tasks |
| doneTasks | Int | `0` | Completed tasks count |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |
| completedAt | DateTime? | -- | Completion timestamp |

**Relations:**
- `results` -> SttBenchmarkResult[] (one-to-many)

---

### SttBenchmarkResult

Individual benchmark result for a model+provider+speed+episode combination.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| experimentId | String | -- | FK to SttExperiment |
| episodeId | String | -- | FK to Episode |
| model | String | -- | Model ID (e.g. "whisper-1", "nova-3") |
| provider | String? | -- | Inference provider |
| speed | Float | -- | Playback speed (1.0, 1.5, 2.0) |
| status | String | `"PENDING"` | Task status |
| costDollars | Float? | -- | Transcription cost |
| latencyMs | Int? | -- | Processing latency |
| wer | Float? | -- | Word Error Rate |
| wordCount | Int? | -- | Hypothesis word count |
| refWordCount | Int? | -- | Reference word count |
| r2AudioKey | String? | -- | R2 key for speed-adjusted audio |
| r2TranscriptKey | String? | -- | R2 key for hypothesis transcript |
| r2RefTranscriptKey | String? | -- | R2 key for reference transcript |
| pollingId | String? | -- | External async job ID |
| errorMessage | String? | -- | Error details on failure |
| createdAt | DateTime | `now()` | Record creation timestamp |
| completedAt | DateTime? | -- | Completion timestamp |

**Relations:**
- `experiment` -> SttExperiment (many-to-one, cascade delete)
- `episode` -> Episode (many-to-one, cascade delete)

**Constraints:**
- `@@unique([experimentId, episodeId, model, provider, speed])` -- one result per combination
- `@@index([experimentId])` -- index for experiment result lookups

---

### PlatformConfig

Key-value runtime configuration for the platform (pipeline toggles, intervals, etc.).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| key | String | -- | Config key (unique), e.g. `pipeline.enabled` |
| value | Json | -- | Config value |
| description | String? | -- | Human-readable description |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |
| updatedBy | String? | -- | Admin clerkId of last editor |

**Relations:** None

**Constraints:**
- `key` is unique

---

## Enums

### AiStage

Pipeline stages for AI model configuration.

| Value | Description |
|-------|-------------|
| `stt` | Speech-to-text (transcription) |
| `distillation` | Claim extraction |
| `narrative` | Narrative generation |
| `tts` | Text-to-speech |

### DistillationStatus

Processing stages for transcript extraction and claim analysis.

| Value | Description |
|-------|-------------|
| `PENDING` | Not yet started |
| `FETCHING_TRANSCRIPT` | Retrieving transcript from feed URL or STT |
| `TRANSCRIPT_READY` | Transcript obtained, awaiting claim extraction |
| `EXTRACTING_CLAIMS` | LLM is extracting claims from transcript |
| `COMPLETED` | Transcript and claims ready |
| `FAILED` | Processing failed |

### ClipStatus

Processing stages for audio clip generation.

| Value | Description |
|-------|-------------|
| `PENDING` | Not yet started |
| `GENERATING_NARRATIVE` | LLM is writing the narrative script |
| `GENERATING_AUDIO` | TTS is generating audio |
| `COMPLETED` | Audio clip ready |
| `FAILED` | Processing failed |

### FeedItemSource

How a feed item was created.

| Value | Description |
|-------|-------------|
| `SUBSCRIPTION` | Auto-generated when a new episode is detected for a subscribed podcast |
| `ON_DEMAND` | Created by a user's explicit on-demand briefing request |

### FeedItemStatus

Lifecycle of a feed item.

| Value | Description |
|-------|-------------|
| `PENDING` | Pipeline not yet started |
| `PROCESSING` | Pipeline is generating the clip |
| `READY` | Clip is available for playback |
| `FAILED` | Pipeline failed |

### BriefingRequestStatus

Lifecycle of a user's briefing request.

| Value | Description |
|-------|-------------|
| `PENDING` | Request received, not yet dispatched |
| `PROCESSING` | Pipeline jobs are in progress |
| `COMPLETED` | All jobs done, briefing assembled |
| `FAILED` | Request failed |

### PipelineStage

The stages of the demand-driven pipeline.

| Value | Description |
|-------|-------------|
| `TRANSCRIPTION` | Fetch or generate transcript |
| `DISTILLATION` | Extract claims from transcript |
| `NARRATIVE_GENERATION` | Generate narrative text from claims |
| `AUDIO_GENERATION` | Convert narrative to audio via TTS |
| `CLIP_GENERATION` | Legacy value (kept for backward compatibility with existing data) |
| `BRIEFING_ASSEMBLY` | Assemble clips into final briefing |

Note: Feed Refresh runs on a cron schedule and is not tracked as a PipelineStage.

### PipelineJobStatus

Lifecycle of a single pipeline job.

| Value | Description |
|-------|-------------|
| `PENDING` | Job created, not yet started |
| `IN_PROGRESS` | Job is being processed |
| `COMPLETED` | Job finished successfully |
| `FAILED` | Job failed |

### PipelineStepStatus

Outcome of a single pipeline step within a job.

| Value | Description |
|-------|-------------|
| `PENDING` | Step not yet started |
| `IN_PROGRESS` | Step is executing |
| `COMPLETED` | Step finished successfully |
| `SKIPPED` | Step was skipped (e.g., cached result used) |
| `FAILED` | Step failed |

### PipelineEventLevel

Severity levels for pipeline events.

| Value | Description |
|-------|-------------|
| `DEBUG` | Detailed debugging information |
| `INFO` | Normal operational events |
| `WARN` | Warning conditions |
| `ERROR` | Error conditions |

### WorkProductType

Types of artifacts stored in R2.

| Value | Description |
|-------|-------------|
| `TRANSCRIPT` | Full episode transcript |
| `CLAIMS` | Extracted claims JSON |
| `NARRATIVE` | Generated narrative script |
| `AUDIO_CLIP` | Generated audio clip for an episode |
| `BRIEFING_AUDIO` | _(Deprecated, unused)_ Was used for server-side assembled briefing audio |

### SttExperimentStatus

Lifecycle of an STT benchmark experiment.

| Value | Description |
|-------|-------------|
| `PENDING` | Experiment created, not yet started |
| `RUNNING` | Benchmark tasks are executing |
| `COMPLETED` | All tasks finished |
| `FAILED` | Experiment failed |
| `CANCELLED` | Experiment was cancelled |

---

## Prisma Generators

The schema defines two generators:

| Generator | Output | Runtime | Purpose |
|-----------|--------|---------|---------|
| `client` | `src/generated/prisma` | `cloudflare` | Worker runtime (CF Workers) |
| `scripts` | `src/generated/prisma-node` | `nodejs` | CLI scripts (seed, clean, db:check) |

---

## Cascade Delete Behavior

All foreign key relations use `onDelete: Cascade`. Deleting a parent record removes all children:

| Deleted Parent | Cascaded Deletions |
|----------------|-------------------|
| Plan | (none -- Users reference Plan but no cascade) |
| User | Subscriptions, Briefings, FeedItems, BriefingRequests |
| Podcast | Episodes, Subscriptions, FeedItems |
| Episode | Distillation, Clips, FeedItems, PipelineJobs, WorkProducts, SttBenchmarkResults |
| Distillation | Clips |
| BriefingRequest | PipelineJobs |
| PipelineJob | PipelineSteps |
| PipelineStep | PipelineEvents |
| AiModel | AiModelProviders |
| SttExperiment | SttBenchmarkResults |

Note: WorkProduct deletion does NOT cascade to PipelineSteps (the FK is nullable).
