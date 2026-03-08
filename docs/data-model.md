# Blipp Data Model Reference

Generated from `prisma/schema.prisma` on the `feat/subscriptions-feed` branch.

## Entity Relationship Diagram

```
                         +----------------+
                         | PlatformConfig |
                         +----------------+

  +------+    +----------+    +----------+    +-------+
  | Plan |    |   User   |--->| FeedItem |    |Podcast|
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
                 |   |      | Pipeline |--->| Pipeline  |
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
```

### Key Relationships

```
User 1---* Subscription *---1 Podcast
User 1---* Briefing *---1 Clip
User 1---* FeedItem *---1 Episode
User 1---* BriefingRequest
BriefingRequest 1---* PipelineJob *---1 Episode
PipelineJob 1---* PipelineStep *--? WorkProduct
Podcast 1---* Episode
Podcast 1---* FeedItem
Episode 1--? Distillation 1---* Clip
Episode 1---* Clip
Episode 1---* WorkProduct
FeedItem *--? Briefing (via briefingId)
Briefing *---1 Clip (shared content)
```

Legend: `1---*` = one-to-many, `1--?` = one-to-zero-or-one, `*---1` = many-to-one

---

## Models

### Plan

Defines subscription tiers with pricing and Stripe integration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| tier | UserTier | -- | Subscription tier (unique) |
| name | String | -- | Display name |
| priceCents | Int | -- | Price in cents |
| stripePriceId | String? | -- | Stripe Price ID (unique) |
| stripeProductId | String? | -- | Stripe Product ID (unique) |
| features | String[] | -- | Feature list for display |
| highlighted | Boolean | `false` | Whether to highlight in UI |
| active | Boolean | `true` | Whether plan is available |
| sortOrder | Int | `0` | Display ordering |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:** None

**Constraints:**
- `tier` is unique
- `stripePriceId` is unique
- `stripeProductId` is unique

---

### User

Authenticated user from Clerk with tier info.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| clerkId | String | -- | Clerk user ID (unique) |
| email | String | -- | Email address (unique) |
| name | String? | -- | Display name |
| imageUrl | String? | -- | Profile image URL |
| stripeCustomerId | String? | -- | Stripe Customer ID (unique) |
| tier | UserTier | `FREE` | Current subscription tier |
| isAdmin | Boolean | `false` | Admin access flag |
| createdAt | DateTime | `now()` | Record creation timestamp |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |

**Relations:**
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
| categories | String[] | -- | Category tags |
| lastFetchedAt | DateTime? | -- | Last successful feed fetch |
| feedHealth | String? | -- | Feed health status indicator |
| feedError | String? | -- | Last feed fetch error |
| episodeCount | Int | `0` | Cached episode count |
| status | String | `"active"` | Podcast status |
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
| durationTier | Int | -- | Target duration in minutes |
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
| durationTier | Int | -- | Briefing duration in minutes (1, 2, 3, 5, 7, 10, or 15) |
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

**Constraints:** None beyond standard FK

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

**Constraints:** None beyond standard FK

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
| cost | Float? | -- | Estimated cost (API calls, etc.) |
| retryCount | Int | `0` | Number of retries |
| workProductId | String? | -- | FK to WorkProduct |
| createdAt | DateTime | `now()` | Record creation timestamp |

**Relations:**
- `job` -> PipelineJob (many-to-one, cascade delete)
- `workProduct` -> WorkProduct? (many-to-one)

**Constraints:** None beyond standard FK

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

### PlatformConfig

Key-value runtime configuration for the platform (pipeline toggles, intervals, etc.).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | `cuid()` | Primary key |
| key | String | -- | Config key (unique), e.g. `pipeline.enabled` |
| value | Json | -- | Config value |
| description | String? | -- | Human-readable description |
| updatedAt | DateTime | `@updatedAt` | Last update timestamp |
| updatedBy | String? | -- | User ID of last editor |

**Relations:** None

**Constraints:**
- `key` is unique

---

## Enums

### UserTier

Subscription tier levels.

| Value | Description |
|-------|-------------|
| `FREE` | Free tier with ads and limited briefings |
| `PRO` | Paid tier with longer briefings, no ads |
| `PRO_PLUS` | Premium tier with all features |

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

The four stages of the demand-driven pipeline.

| Value | Description |
|-------|-------------|
| `TRANSCRIPTION` | Stage 2: Fetch or generate transcript |
| `DISTILLATION` | Stage 3: Extract claims from transcript |
| `CLIP_GENERATION` | Stage 4: Generate narrative and audio clip |
| `BRIEFING_ASSEMBLY` | Stage 5: Assemble clips into final briefing |

Note: Stage 1 (Feed Refresh) runs on a cron schedule and is not tracked as a PipelineStage.

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

### WorkProductType

Types of artifacts stored in R2.

| Value | Description |
|-------|-------------|
| `TRANSCRIPT` | Full episode transcript |
| `CLAIMS` | Extracted claims JSON |
| `NARRATIVE` | Generated narrative script |
| `AUDIO_CLIP` | Generated audio clip for an episode |
| `BRIEFING_AUDIO` | Final assembled briefing audio |

---

## Cascade Delete Behavior

All foreign key relations use `onDelete: Cascade`. Deleting a parent record removes all children:

| Deleted Parent | Cascaded Deletions |
|----------------|-------------------|
| User | Subscriptions, Briefings, FeedItems, BriefingRequests |
| Podcast | Episodes, Subscriptions, FeedItems |
| Episode | Distillation, Clips, FeedItems, PipelineJobs, WorkProducts |
| Distillation | Clips |
| BriefingRequest | PipelineJobs |
| PipelineJob | PipelineSteps |

Note: WorkProduct deletion does NOT cascade to PipelineSteps (the FK is nullable).
