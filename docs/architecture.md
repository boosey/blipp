# Blipp Architecture

Blipp is a podcast briefing app that distills podcast episodes into short audio briefings. Users subscribe to podcasts, and the system generates personalized audio briefings by transcribing episodes, extracting key claims, generating narratives, and assembling them with TTS.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers (fetch + queue + scheduled) |
| HTTP Framework | Hono v4 |
| Database | PostgreSQL on Neon |
| ORM | Prisma 7 with `@prisma/adapter-pg` + Cloudflare Hyperdrive |
| Auth | Clerk (`@hono/clerk-auth` middleware) |
| Payments | Stripe (checkout, portal, webhooks) |
| Object Storage | Cloudflare R2 |
| Task Queues | 9 Cloudflare Queues |
| AI (LLM) | Anthropic Claude, Groq, Cloudflare Workers AI (multi-provider) |
| AI (STT) | OpenAI Whisper, Deepgram Nova, AssemblyAI, Google Chirp, Groq, Cloudflare Workers AI (multi-provider) |
| AI (TTS) | OpenAI TTS, Groq Orpheus, Cloudflare Workers AI (multi-provider) |
| Podcast Discovery | Local catalog (populated via admin catalog refresh from Podcast Index) |

## System Diagram

```
                          +------------------+
                          |   Clerk (Auth)   |
                          +--------+---------+
                                   |
  +----------+            +--------v---------+            +------------------+
  |  React   | --HTTP-->  | Cloudflare Worker| --SQL----> | Neon PostgreSQL  |
  |  SPA     |            |  (Hono v4)       |            | via Hyperdrive   |
  +----------+            +--+----+----+-----+            +------------------+
                             |    |    |
              +--------------+    |    +---------------+
              |                   |                    |
     +--------v-------+  +-------v--------+   +-------v-------+
     | Cloudflare R2  |  | Stripe         |   | AI Providers  |
     | (audio/clips)  |  | (billing)      |   | (multi-vendor)|
     +----------------+  +----------------+   +---------------+

  Worker Handlers:
  ================
  fetch     -->  Hono HTTP server (API + SPA asset serving)
  queue     -->  9 queue consumers (pipeline stages + catalog + prefetch)
  scheduled -->  Cron heartbeat (*/5) dispatching named jobs (pipeline-trigger, monitoring, etc.)

  Pipeline Flow (demand-driven):
  ==============================

  User requests briefing
       |
       v
  +-------------+     +--------------+     +--------------+
  | Orchestrator | --> | 1. Feed      | --> | 2. Transcript|
  | Queue        |     |    Refresh   |     |    ion       |
  +-+-----+------+     +--------------+     +--------------+
    ^     |                                        |
    |     |             +--------------+     +-----v--------+
    |     +-----------> | 3. Distill-  | --> | 4. Narrative |
    |                   |    ation     |     |    Gen       |
    |                   +--------------+     +-----+--------+
    |                                              |
    |                   +--------------+     +-----v--------+
    |                   | 6. Briefing  | <-- | 5. Audio     |
    +-------------------+    Assembly  |     |    Gen       |
      (stage reports)   +--------------+     +--------------+
```

## Worker Entry Point

The worker (`worker/index.ts`) exports three handlers:

- **`fetch`** -- Hono HTTP server handling all API requests and serving the SPA via Cloudflare Assets.
- **`queue`** -- Dispatches incoming queue messages to the appropriate stage consumer based on queue name.
- **`scheduled`** -- Cron heartbeat (every 5 minutes) that dispatches named jobs via the `runJob()` framework. Each job manages its own enable toggle and run interval via PlatformConfig. Jobs: `pipeline-trigger` (feed refresh + pipeline gating), `monitoring` (pricing refresh, cost alerts), `user-lifecycle` (inactive user handling), `data-retention` (archiving old data), `recommendations` (profile recomputation). Execution is tracked via `CronRun` / `CronRunLog` records.

All three handlers pass the environment through `shimQueuesForLocalDev()` which provides a local queue shim during development.

## Environment Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `ASSETS` | Fetcher | SPA static assets |
| `AI` | Ai | Cloudflare Workers AI binding for CF-hosted models |
| `HYPERDRIVE` | Hyperdrive | PostgreSQL connection pooling |
| `R2` | R2Bucket | Audio clips, work products, benchmark artifacts |
| `FEED_REFRESH_QUEUE` | Queue | Periodic RSS feed polling (not a pipeline stage) |
| `TRANSCRIPTION_QUEUE` | Queue | Pipeline: Transcript fetching |
| `DISTILLATION_QUEUE` | Queue | Pipeline: Claim extraction via LLM |
| `NARRATIVE_GENERATION_QUEUE` | Queue | Pipeline: Narrative writing via LLM |
| `AUDIO_GENERATION_QUEUE` | Queue | Pipeline: TTS audio via multi-provider TTS |
| `BRIEFING_ASSEMBLY_QUEUE` | Queue | Pipeline: Briefing creation + FeedItem linking |
| `ORCHESTRATOR_QUEUE` | Queue | Pipeline coordination |
| `CATALOG_REFRESH_QUEUE` | Queue | Podcast catalog seeding/refresh |
| `CONTENT_PREFETCH_QUEUE` | Queue | Slow transcript/audio validation |
| `CLERK_SECRET_KEY` | string | Clerk authentication |
| `CLERK_PUBLISHABLE_KEY` | string | Clerk frontend auth |
| `CLERK_WEBHOOK_SECRET` | string | Clerk webhook verification |
| `STRIPE_SECRET_KEY` | string | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | string | Stripe webhook verification |
| `ANTHROPIC_API_KEY` | string | Claude API for distillation/narrative |
| `OPENAI_API_KEY` | string | OpenAI TTS + Whisper STT |
| `PODCAST_INDEX_KEY` | string | Podcast Index API |
| `PODCAST_INDEX_SECRET` | string | Podcast Index API |
| `DEEPGRAM_API_KEY` | string | Deepgram STT (Nova models) |
| `ASSEMBLYAI_API_KEY` | string | AssemblyAI STT |
| `GOOGLE_STT_API_KEY` | string | Google Cloud STT (Chirp) |
| `GROQ_API_KEY` | string | Groq STT/LLM/TTS |
| `ALLOWED_ORIGINS` | string? | Comma-separated CORS origin allowlist (optional) |
| `APP_ORIGIN` | string? | Base URL for this environment (Stripe redirects) |
| `NEON_API_KEY` | string? | Neon API key for backup verification (optional) |
| `NEON_PROJECT_ID` | string? | Neon project ID for backup verification (optional) |
| `VAPID_PUBLIC_KEY` | string? | Web Push VAPID public key (optional) |
| `VAPID_PRIVATE_KEY` | string? | Web Push VAPID private key (optional) |
| `VAPID_SUBJECT` | string? | Web Push VAPID subject / mailto URL (optional) |

## Queue System

| Queue Name | Binding | Batch Size | Retries | Purpose |
|------------|---------|-----------|---------|---------|
| `feed-refresh` | `FEED_REFRESH_QUEUE` | 10 | 3 | RSS polling |
| `transcription` | `TRANSCRIPTION_QUEUE` | 5 | 3 | Transcript fetch |
| `distillation` | `DISTILLATION_QUEUE` | 5 | 3 | Claim extraction |
| `narrative-generation` | `NARRATIVE_GENERATION_QUEUE` | 5 | 3 | Narrative writing |
| `clip-generation` | `AUDIO_GENERATION_QUEUE` | 3 | 3 | TTS generation (legacy queue name) |
| `briefing-assembly` | `BRIEFING_ASSEMBLY_QUEUE` | 5 | 3 | Briefing creation |
| `orchestrator` | `ORCHESTRATOR_QUEUE` | 10 | 3 | Coordination |
| `catalog-refresh` | `CATALOG_REFRESH_QUEUE` | 5 | 3 | Podcast catalog seeding/refresh |
| `content-prefetch` | `CONTENT_PREFETCH_QUEUE` | 5 | 3 | Slow transcript/audio validation |

**Note:** The `AUDIO_GENERATION_QUEUE` binding maps to the `clip-generation` queue name in `wrangler.jsonc` (legacy naming). The queue dispatcher in `worker/queues/index.ts` routes `clip-generation` messages to `handleAudioGeneration`.

### Pipeline Architecture

The pipeline is **demand-driven**: only feed refresh runs on a cron schedule. All other stages are triggered by a user requesting a briefing.

**Feed Refresh** (standalone cron job, not a pipeline stage) -- Polls RSS feeds, upserts new episodes into the database. Runs on cron (`*/30 * * * *`), gated by runtime config.

The 5 pipeline stages (triggered by user briefing requests):

1. **Transcription** -- Three-tier transcript waterfall: (1) RSS feed transcript URL, (2) Podcast Index API lookup by episode GUID, (3) Whisper STT with chunked transcription for files over 25MB.
2. **Distillation** -- Sends transcript to LLM (Anthropic Claude or other configured provider) for claim extraction. Stores results in Distillation model.
3. **Narrative Generation** -- Generates narrative text from distillation claims using LLM. Stores narrative on Clip record and creates NARRATIVE WorkProduct.
4. **Audio Generation** -- Converts narrative text to MP3 audio via TTS (multi-provider: OpenAI, Groq, Cloudflare). Stores MP3s in R2, updates Clip to COMPLETED, creates AUDIO_CLIP WorkProduct.
5. **Briefing Assembly** -- Creates per-user Briefing records wrapping shared Clips, then updates FeedItems to READY with briefingId on success, FAILED on failure.

### Orchestrator

The orchestrator queue is the pipeline brain. It uses a **push-based** model:

- When a user requests a briefing, a `BriefingRequest` is created and dispatched to the orchestrator.
- The orchestrator evaluates which episodes need processing and creates `PipelineJob` records (one per episode + duration tier).
- Each stage reports completion back to `ORCHESTRATOR_QUEUE`, which advances the job to the next stage.
- When all jobs for a request complete, briefing assembly is triggered — this links completed Clips to Briefing records and marks FeedItems as READY.
- Partial completion is supported: if some jobs fail, briefings are created from the successful ones.
- Intro/outro jingles are played client-side via audio element sequencing with Cache API caching (not server-side concatenation). See `docs/decisions/2026-03-15-client-side-jingles.md`.

### WorkProduct Registry

Pipeline stages store intermediate and final outputs in R2 via the `WorkProduct` model. Each type has a deterministic R2 key pattern:

| Type | R2 Key Pattern | Stage |
|------|---------------|-------|
| `TRANSCRIPT` | `wp/transcript/{episodeId}.txt` | Transcription |
| `CLAIMS` | `wp/claims/{episodeId}.json` | Distillation |
| `NARRATIVE` | `wp/narrative/{episodeId}/{durationTier}.txt` | Narrative Gen |
| `AUDIO_CLIP` | `wp/clip/{episodeId}/{durationTier}/{voice}.mp3` | Audio Gen |
| `BRIEFING_AUDIO` | (enum only — no wpKey builder) | Reserved |
| `SOURCE_AUDIO` | `wp/source-audio/{episodeId}.bin` | Transcription (debug) |

### Runtime Configuration

Pipeline behavior is controlled via the `PlatformConfig` table with a 60-second TTL in-memory cache:

| Key | Purpose |
|-----|---------|
| `pipeline.enabled` | Master kill switch for the entire pipeline |
| `pipeline.minIntervalMinutes` | Throttle between feed refresh runs |
| `pipeline.stage.N.enabled` | Per-stage enable/disable |
| `pipeline.feedRefresh.maxEpisodesPerPodcast` | Cap on episodes ingested per podcast |
| `pipeline.logLevel` | Structured log verbosity (error/info/debug) |
| `ai.stt.model` | STT model + provider config (JSON: `{provider, model}`) |
| `ai.distillation.model` | Distillation LLM model + provider config |
| `ai.narrative.model` | Narrative LLM model + provider config |
| `ai.tts.model` | TTS model + provider config |
| `pricing.lastRefreshedAt` | Daily pricing refresh timestamp |

Each queue handler checks its stage-enabled gate before processing. Messages with `type: "manual"` bypass the gate (for admin-triggered runs).

### Multi-Provider AI Architecture

AI operations use a pluggable provider architecture with three provider registries:

| Registry | File | Providers |
|----------|------|-----------|
| STT | `worker/lib/stt-providers.ts` | OpenAI, Deepgram, AssemblyAI, Google, Groq, Cloudflare Workers AI |
| LLM | `worker/lib/llm-providers.ts` | Anthropic, Groq, Cloudflare Workers AI |
| TTS | `worker/lib/tts-providers.ts` | OpenAI, Groq, Cloudflare Workers AI |

Model configuration is stored in the `AiModel` and `AiModelProvider` database tables. Each model has one or more providers with pricing metadata. The active model+provider for each pipeline stage is read from `PlatformConfig` via `getModelConfig(prisma, stage)`.

The admin Model Registry page (`/admin/model-registry`) allows managing available models, providers, and pricing.

## Database Schema

### Core Models

| Model | Purpose |
|-------|---------|
| `Plan` | Subscription plans with limits, feature flags, and Stripe billing (slug-based) |
| `User` | User profile with Clerk ID, Stripe customer ID, `planId` FK, `isAdmin` flag |
| `Podcast` | Podcast metadata (title, feed URL, image, health status) |
| `Episode` | Individual episodes linked to podcasts |
| `Subscription` | User-to-podcast subscriptions with per-subscription duration tier and optional voice preset |
| `VoicePreset` | Configurable TTS voice presets with per-provider config (voice, instructions, speed) |

### Pipeline Models

| Model | Purpose |
|-------|---------|
| `BriefingRequest` | User's request for a briefing (PENDING -> PROCESSING -> COMPLETED/FAILED) |
| `PipelineJob` | One episode + duration tier per request. Flows through stages. |
| `PipelineStep` | Audit trail per stage execution (started, completed, failed, duration) |
| `PipelineEvent` | Structured event log entries per step (DEBUG/INFO/WARN/ERROR) |
| `Distillation` | Cached claim extraction results for an episode |
| `Clip` | Cached TTS audio clip for a distillation segment |
| `WorkProduct` | Generic keyed work product store for pipeline stage outputs in R2 |

### Delivery Models

| Model | Purpose |
|-------|---------|
| `Briefing` | Per-user wrapper around a shared Clip (will carry personalized ad audio) |
| `FeedItem` | Per-user feed entry, points to a Briefing (or Digest in future) |

### AI & Experimentation Models

| Model | Purpose |
|-------|---------|
| `AiModel` | AI model registry entries (stage, modelId, developer) |
| `AiModelProvider` | Provider configurations per model (pricing, availability) |
| `SttExperiment` | STT benchmark experiment definition |
| `SttBenchmarkResult` | Individual benchmark result (WER, cost, latency per model/speed) |

### Pipeline & Operations Models

| Model | Purpose |
|-------|---------|
| `AiServiceError` | Structured AI provider error tracking with classification |
| `AuditLog` | Admin action audit trail |
| `ApiKey` | API key management (hashed keys with scopes) |
| `CronRun` | Scheduled job execution records |
| `CronRunLog` | Per-run structured log entries |

### Recommendation Models

| Model | Purpose |
|-------|---------|
| `PodcastProfile` | Per-podcast category weights, topic tags, popularity |
| `UserRecommendationProfile` | Per-user aggregated category weights + topic tags |
| `RecommendationCache` | Precomputed top-20 podcast recommendations per user |

### Catalog Models

| Model | Purpose |
|-------|---------|
| `PodcastRequest` | User-submitted podcast requests with admin review |
| `Category` | Apple genre taxonomy entries |
| `PodcastCategory` | Join table linking podcasts to categories |

### User Models

| Model | Purpose |
|-------|---------|
| `PodcastFavorite` | User favorites (interest signals for recommendations) |
| `PushSubscription` | Web push notification subscriptions |

### Configuration

| Model | Purpose |
|-------|---------|
| `PlatformConfig` | Key-value runtime configuration store |

### Key Relations

```
Plan ---< User
User ---< Subscription >--- Podcast ---< Episode
User ---< Briefing >--- Clip
User ---< FeedItem >--- Episode
FeedItem --- Briefing (via briefingId)
User ---< BriefingRequest ---< PipelineJob ---< PipelineStep ---< PipelineEvent
Episode ---< Distillation ---< Clip
Episode ---< WorkProduct
PipelineStep --- WorkProduct
AiModel ---< AiModelProvider
SttExperiment ---< SttBenchmarkResult >--- Episode
User ---< PodcastFavorite >--- Podcast
User ---< PushSubscription
User ---< PodcastRequest >--- Podcast (optional)
User ---< UserRecommendationProfile
User ---< RecommendationCache
Podcast ---< PodcastProfile
Podcast ---< PodcastCategory >--- Category
User ---< ApiKey
User ---< AuditLog
CronRun ---< CronRunLog
```

## Middleware Stack

All `/api/*` routes pass through these global middleware layers in `worker/index.ts` (in order):

1. **Request ID** (`worker/middleware/request-id.ts`) — Adds correlation ID to each request (must be first so all other middleware can access it)
2. **CORS** (`hono/cors`) — Explicit origin allowlist from `ALLOWED_ORIGINS` env var (falls back to hardcoded defaults)
3. **Clerk auth** (`worker/middleware/auth.ts`) — Populates auth context from JWT
4. **Request Logger** (`worker/middleware/request-logger.ts`) — Structured HTTP request logging (after auth so userId is available)
5. **Prisma** (`worker/middleware/prisma.ts`) — Creates per-request PrismaClient on `c.get("prisma")` and disconnects via `waitUntil`
6. **API Key auth** (`worker/middleware/api-key.ts`) — Falls through to Clerk auth if no API key header present (after Prisma, needs DB lookup)
7. **Rate Limiting** (`worker/middleware/rate-limit.ts`) — Sliding window rate limiter (in-memory); tighter limits on `/api/briefings/generate` (10/hr) and `/api/podcasts/subscribe` (5/min), general 120 req/min for all API routes (webhooks and health exempt)
8. **Cache** (`worker/middleware/cache.ts`) — Response caching for read-heavy endpoints (`/api/podcasts/catalog`, `/api/health/deep`)
9. **Security Headers** (`worker/middleware/security-headers.ts`) — X-Frame-Options, CSP, etc. for all responses (applied to `/*`, not just `/api/*`)

Route handlers access the database with `const prisma = c.get("prisma") as any;` — no manual creation or cleanup needed.

### Shared Helpers

| Helper | Location | Purpose |
|--------|----------|---------|
| `parsePagination(c)` | `worker/lib/admin-helpers.ts` | Parse page/pageSize from query params |
| `parseSort(c)` | `worker/lib/admin-helpers.ts` | Parse sort query into Prisma orderBy |
| `paginatedResponse()` | `worker/lib/admin-helpers.ts` | Standard paginated response shape |
| `getCurrentUser(c, prisma)` | `worker/lib/admin-helpers.ts` | Resolve Clerk auth to DB User (auto-creates if missing) |
| `getUserWithPlan(c, prisma)` | `worker/lib/plan-limits.ts` | Get user with plan included for limit checks |
| `checkDurationLimit()` | `worker/lib/plan-limits.ts` | Enforce plan max duration |
| `checkSubscriptionLimit()` | `worker/lib/plan-limits.ts` | Enforce plan max subscriptions |
| `checkWeeklyBriefingLimit()` | `worker/lib/plan-limits.ts` | Enforce plan weekly briefing cap |
| `checkStageEnabled()` | `worker/lib/queue-helpers.ts` | Pipeline stage gate (config + manual bypass) |
| `useFetch<T>(endpoint)` | `src/lib/use-fetch.ts` | Frontend data-fetching hook with loading/error state |
| `getModelConfig(prisma, stage)` | `worker/lib/ai-models.ts` | Read AI model+provider config for a stage |
| `getModelRegistry(prisma, stage?)` | `worker/lib/ai-models.ts` | Query active models with providers from DB |
| `wpKey(params)` | `worker/lib/work-products.ts` | Build R2 keys for work products |
| `writeEvent(prisma, stepId, ...)` | `worker/lib/pipeline-events.ts` | Write structured pipeline events (fire-and-forget) |
| `createPipelineLogger(opts)` | `worker/lib/logger.ts` | Structured JSON logger with configurable level |
| `classifyAiError()` | `worker/lib/ai-errors.ts` | Classify AI provider errors by category/severity |
| `writeAiError()` | `worker/lib/ai-errors.ts` | Record AI service errors to database |
| `resolveStageModel()` | `worker/lib/model-resolution.ts` | Resolve AI model+provider with fallback chain |
| `computePodcastProfiles()` | `worker/lib/recommendations.ts` | Compute recommendation profiles |
| `audit()` | `worker/lib/audit-log.ts` | Write admin audit log entries |
| `classifyHttpError()` | `worker/lib/errors.ts` | Classify unhandled errors into HTTP status codes |
| `deepHealthCheck()` | `worker/lib/health.ts` | Check DB/R2/queue health for `/api/health/deep` |
| `getFeatureFlag()` | `worker/lib/feature-flags.ts` | Read boolean feature flags from PlatformConfig |
| `runJob()` | `worker/lib/cron/runner.ts` | Cron job framework with CronRun/CronRunLog tracking |

## Authentication & Authorization

### Auth Flow

1. Clerk middleware is applied globally to all `/api/*` routes in `worker/index.ts`.
2. **`requireAuth`** middleware (`worker/middleware/auth.ts`) checks `getAuth(c)?.userId` and returns 401 if missing.
3. **`requireAdmin`** middleware (`worker/middleware/admin.ts`) additionally looks up the User by `clerkId` and checks the `isAdmin` field, returning 403 if not an admin.

### Plan-Based Limits

Plan limits are enforced in route handlers using helpers from `worker/lib/plan-limits.ts`:

- **Duration limit**: `maxDurationMinutes` on the Plan model caps the durationTier a user can select
- **Subscription limit**: `maxPodcastSubscriptions` (null = unlimited) caps podcast subscriptions
- **Weekly briefing limit**: `briefingsPerWeek` (null = unlimited) caps FeedItems created per 7-day window

### Route Protection

| Route Pattern | Auth Level |
|--------------|------------|
| `GET /api/plans` | Public (no auth) |
| `GET /api/health` | Public (no auth) |
| `GET /api/health/deep` | Public (no auth, cached 30s) |
| `POST /api/webhooks/*` | Webhook signature verification |
| `/api/me` | `requireAuth` |
| `/api/podcasts/*` | `requireAuth` + plan limits |
| `/api/briefings/*` | `requireAuth` + plan limits |
| `/api/feed/*` | `requireAuth` |
| `/api/clips/*` | `requireAuth` |
| `/api/billing/*` | `requireAuth` |
| `/api/admin/*` | `requireAdmin` |

## API Route Tree

### Public Routes (`/api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/plans` | List active subscription plans (with limits and pricing) |
| GET | `/plans/current` | Get authenticated user's current plan |
| POST | `/webhooks/clerk` | Clerk user sync webhook |
| POST | `/webhooks/stripe` | Stripe payment webhook |
| GET | `/health` | Health check |

### Auth-Protected Routes (`/api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me` | Get/create current user with plan info |
| GET | `/podcasts/catalog` | Browse/search local podcast catalog |
| GET | `/podcasts/:id` | Podcast detail with subscription status |
| GET | `/podcasts/:id/episodes` | Episode list for a podcast |
| POST | `/podcasts/subscribe` | Subscribe to a podcast (requires durationTier) |
| PATCH | `/podcasts/subscribe/:podcastId` | Update subscription durationTier |
| DELETE | `/podcasts/subscribe/:podcastId` | Unsubscribe from a podcast |
| POST | `/podcasts/refresh` | Queue feed refresh for user's subscriptions |
| GET | `/podcasts/subscriptions` | List user subscriptions |
| POST | `/briefings/generate` | Create on-demand briefing (requires podcastId + durationTier) |
| GET | `/feed` | Paginated feed items (filterable by status, listened) |
| GET | `/feed/counts` | Feed item counts |
| GET | `/feed/:id` | Feed item detail with clip |
| PATCH | `/feed/:id/listened` | Mark feed item as listened |
| GET | `/clips/:episodeId/:durationTier` | Stream clip audio from R2 |
| POST | `/billing/checkout` | Create Stripe checkout session (planId + interval) |
| POST | `/billing/portal` | Create Stripe customer portal session |

### Admin Routes (`/api/admin`)

18 route modules: dashboard, podcasts, episodes, pipeline, config, users, analytics, briefings, requests, plans, stt-benchmark, ai-models, ai-errors, audit-log, api-keys, ads, recommendations, cron-jobs.

Notable admin endpoints:
- `POST /api/admin/requests/test-briefing` -- Trigger a test briefing with specific podcast/episode selection
- `GET /api/admin/pipeline` -- Pipeline status and job listing
- `GET/PATCH /api/admin/config` -- Runtime configuration management
- `GET/POST /api/admin/ai-models` -- AI model registry management
- `GET/POST /api/admin/stt-benchmark/experiments` -- STT benchmark experiments
- `GET/POST/PATCH/DELETE /api/admin/plans` -- Plan CRUD management
- `GET /api/admin/ai-errors` -- AI service error log with filtering
- `GET /api/admin/audit-log` -- Admin action audit trail
- `GET/POST/DELETE /api/admin/api-keys` -- API key management
- `GET/PATCH /api/admin/ads` -- Ad slot management
- `GET /api/admin/recommendations` -- Recommendation profiles and cache
- `GET /api/admin/cron-jobs` -- Scheduled job runs and logs

**Note:** The `clean-r2` route module is mounted separately at `/api/internal/clean` (not under `/api/admin`).

## Frontend Architecture

### Build & Serving

The frontend is built with Vite 7 using `@cloudflare/vite-plugin` in SPA mode. The Cloudflare Worker serves built assets via the `ASSETS` binding, with all non-API routes falling through to `index.html` for client-side routing.

### Page Structure

| Section | Pages | Layout |
|---------|-------|--------|
| Public | Landing (`/`), Pricing (`/pricing`) | Minimal |
| User | Home (`/home`), Discover (`/discover`), Podcast Detail (`/discover/:podcastId`), Library (`/library`), Player (`/play/:feedItemId`), Settings (`/settings`) | `MobileLayout` |
| Admin | 20 pages (Command Center, Pipeline, Pipeline Controls, Catalog, Briefings, Users, Plans, Analytics, Requests, STT Benchmark, Model Registry, Stage Models, AI Errors, Recommendations, Scheduled Jobs, Feature Flags, Podcast Settings, Ads, API Keys, Audit Log) | `AdminLayout` (dark sidebar) |

Redirects: `/dashboard` redirects to `/home`, `/billing` redirects to `/settings`, `/briefing/*` redirects to `/home`.

Admin pages are lazy-loaded via `React.lazy()` for code splitting. An `AdminGuard` component wraps admin routes and checks the user's admin status before rendering.

### Mobile-First User App

The user-facing app uses `MobileLayout`, a mobile-first layout with a bottom tab navigation bar (`BottomNav`). The four tabs are:

| Tab | Route | Page |
|-----|-------|------|
| Home | `/home` | `home.tsx` -- Feed view with subscription and on-demand items |
| Discover | `/discover` | `discover.tsx` -- Podcast catalog browse/search (mobile-optimized) |
| Library | `/library` | `library.tsx` -- User's subscriptions and briefing history |
| Settings | `/settings` | `settings.tsx` -- Account settings and billing |

Additional user pages outside the tab bar:
- **Podcast Detail** (`/discover/:podcastId`) -- `podcast-detail.tsx`, episode list, subscribe with tier picker, on-demand briefing
- **Player** (`/play/:feedItemId`) -- `briefing-player.tsx`, audio playback for a completed feed item clip

### Design System

- **Admin theme**: Dark navy (`#0A1628` background, `#1A2942` cards, `#3B82F6` accents, Inter font)
- **Component library**: shadcn/ui (22+ components installed)
- **CSS**: Tailwind CSS v4 with `tw-animate-css`

### Key Frontend Modules

| File | Purpose |
|------|---------|
| `src/App.tsx` | Route definitions and layout assignments |
| `src/lib/api.ts` | API client for user-facing endpoints |
| `src/lib/admin-api.ts` | `useAdminFetch()` hook with Clerk Bearer token |
| `src/lib/use-fetch.ts` | Generic `useFetch<T>()` hook for data fetching |
| `src/lib/ai-models.ts` | Frontend AI model registry (stage labels, no server imports) |
| `src/types/admin.ts` | Shared type contracts for admin API responses |
| `src/providers/clerk-provider.tsx` | ClerkProvider wrapper |

## File Structure

```
blipp/
  worker/
    index.ts              # Entry point (fetch/queue/scheduled)
    types.ts              # Env type with all bindings
    middleware/
      auth.ts             # requireAuth + clerkMiddleware + getAuth
      admin.ts            # requireAdmin (isAdmin check)
      prisma.ts           # Per-request PrismaClient middleware
      api-key.ts          # API key authentication (falls through to Clerk if absent)
      cache.ts            # Response caching middleware
      rate-limit.ts       # Sliding window rate limiter (in-memory)
      request-id.ts       # Correlation ID middleware
      request-logger.ts   # Structured HTTP request logging
      security-headers.ts # CSP, X-Frame-Options, etc.
    routes/
      index.ts            # Route tree assembly
      me.ts               # GET /me — current user
      plans.ts            # Public plan listing + current plan
      podcasts.ts         # Catalog browse, subscribe, detail, episodes
      briefings.ts        # On-demand briefing generation
      feed.ts             # Feed item list, detail, listened, counts
      clips.ts            # Clip audio streaming from R2
      billing.ts          # Stripe checkout/portal
      webhooks/
        clerk.ts          # User sync webhook
        stripe.ts         # Payment webhook
      admin/
        index.ts          # Admin route tree (18 modules)
        dashboard.ts      # Command center stats
        podcasts.ts       # Podcast catalog management
        episodes.ts       # Episode management
        pipeline.ts       # Pipeline monitoring
        config.ts         # Runtime configuration
        users.ts          # User management
        analytics.ts      # Usage analytics
        briefings.ts      # Briefing inspection
        requests.ts       # Briefing request management
        plans.ts          # Plan CRUD management
        stt-benchmark.ts  # STT benchmark experiments
        ai-models.ts      # AI model registry CRUD
        ai-errors.ts      # AI service error log
        audit-log.ts      # Admin action audit trail
        api-keys.ts       # API key management
        ads.ts            # Ad slot management
        recommendations.ts # Recommendation profiles + cache
        cron-jobs.ts      # Scheduled job runs + logs
        clean-r2.ts       # R2 cleanup (mounted at /internal/clean)
    queues/
      index.ts            # Queue dispatcher + scheduled handler
      feed-refresh.ts     # Periodic RSS polling (standalone cron job)
      transcription.ts    # Pipeline stage 2: Transcript fetching
      distillation.ts     # Pipeline stage 3: LLM claim extraction
      narrative-generation.ts # Pipeline stage 4: LLM narrative writing
      audio-generation.ts    # Stage 5: TTS audio rendering
      briefing-assembly.ts   # Stage 6: Briefing creation + FeedItem linking
      orchestrator.ts     # Pipeline coordination
      catalog-refresh.ts  # Podcast catalog seeding/refresh
      content-prefetch.ts # Slow transcript/audio validation
    lib/
      db.ts               # PrismaClient factory (Hyperdrive)
      config.ts           # Runtime config with 60s TTL cache + stage names
      admin-helpers.ts    # Pagination, sort, response helpers, getCurrentUser
      queue-helpers.ts    # Stage gate, ackAll helpers
      plan-limits.ts      # Plan limit enforcement (duration, subscriptions, weekly briefings)
      ai-models.ts        # AI model config reader (getModelConfig, getModelRegistry)
      llm-providers.ts    # Multi-provider LLM interface (Anthropic, Groq, Cloudflare)
      stt-providers.ts    # Multi-provider STT interface (OpenAI, Deepgram, AssemblyAI, Google, Groq, Cloudflare)
      tts-providers.ts    # Multi-provider TTS interface (OpenAI, Groq, Cloudflare)
      ai-usage.ts         # AI usage tracking helpers
      work-products.ts    # R2 key builders and storage helpers
      pipeline-events.ts  # Structured pipeline event writer (fire-and-forget)
      pricing-updater.ts  # Daily pricing refresh (stamps priceUpdatedAt)
      logger.ts           # Structured JSON pipeline logger with configurable level
      podcast-index.ts    # Podcast Index API client
      rss-parser.ts       # RSS feed parser
      transcript.ts       # Transcript fetching + VTT/SRT parsing
      transcript-source.ts # Podcast Index transcript lookup
      transcript-normalizer.ts # Transcript text normalization for WER comparison
      whisper-chunked.ts  # Chunked Whisper for large files
      distillation.ts     # LLM summarization (claim extraction)
      clip-cache.ts       # Clip cache lookup
      time-fitting.ts     # Duration tier fitting
      tts.ts              # TTS generation orchestrator
      mp3-concat.ts       # Audio concatenation
      stripe.ts           # Stripe client factory
      local-queue.ts      # Local dev queue shim
      wer.ts              # Word Error Rate calculation
      stt-benchmark-runner.ts # STT benchmark task runner
      ai-errors.ts        # AI error classification + recording
      audit-log.ts        # Admin audit log writer
      recommendations.ts  # Recommendation profile computation
      model-resolution.ts # AI model+provider fallback resolution
      queue-messages.ts   # Typed queue message definitions
      voice-presets.ts    # Voice preset resolution + config extraction
      errors.ts           # HTTP error classification
      feature-flags.ts    # Feature flag reader (PlatformConfig booleans)
      health.ts           # Deep health check (DB, R2, queues)
      push.ts             # Web push notification helpers
      user-data.ts        # User data export/deletion utilities
      circuit-breaker.ts  # Circuit breaker for external services
      cost-alerts.ts      # AI cost alerting
      backup-verify.ts    # Database backup verification
      catalog-sources.ts  # Podcast catalog source abstractions
      content-prefetch.ts # Content prefetch logic
      apple-podcasts.ts   # Apple Podcasts API client
      sentry.ts           # Error reporting integration
      constants.ts        # Shared constants (STAGE_NAMES, etc.)
      transcript-sources.ts # Multi-source transcript resolution
      cron/               # Scheduled job implementations
        runner.ts         # Job framework with CronRun/CronRunLog tracking
        pipeline-trigger.ts # Feed refresh + pipeline gating
        monitoring.ts     # Pricing refresh, cost alerts
        user-lifecycle.ts # Inactive user handling
        data-retention.ts # Archiving old data
        recommendations.ts # Profile recomputation
  src/
    App.tsx               # Routes + layouts
    main.tsx              # React entry point
    pages/
      landing.tsx         # Public landing page
      pricing.tsx         # Public pricing page
      home.tsx            # Home tab — briefing feed
      discover.tsx        # Discover tab — catalog browse/search
      podcast-detail.tsx  # Podcast detail with episodes
      library.tsx         # Library tab — subscriptions & history
      briefing-player.tsx # Audio playback for briefings
      settings.tsx        # Settings tab — account & billing
      admin/              # 20 admin pages
        command-center.tsx
        pipeline.tsx
        pipeline-controls.tsx
        catalog.tsx
        briefings.tsx
        users.tsx
        plans.tsx
        analytics.tsx
        requests.tsx
        stt-benchmark.tsx
        model-registry.tsx
        stage-models.tsx
        ai-errors.tsx
        recommendations.tsx
        voice-presets.tsx
        scheduled-jobs.tsx
        feature-flags.tsx
        podcast-settings.tsx
        ads.tsx
        api-keys.tsx
        audit-log.tsx
    layouts/
      mobile-layout.tsx   # Mobile-first layout with bottom nav
      admin-layout.tsx    # Admin dark sidebar layout
    components/
      bottom-nav.tsx      # Bottom tab navigation bar
      admin-guard.tsx     # Admin route guard
      status-badge.tsx    # Status indicator badge
      feed-item.tsx       # Feed item card
      podcast-card.tsx    # Podcast card
      ...                 # Other shared UI components
    lib/
      api.ts              # User API client
      admin-api.ts        # Admin API client with auth
      use-fetch.ts        # Generic useFetch<T>() hook
      ai-models.ts        # Frontend AI model stage labels
    providers/
      clerk-provider.tsx  # ClerkProvider wrapper
    types/
      admin.ts            # Shared admin type contracts
      user.ts             # User-facing type contracts
      feed.ts             # FeedItem and FeedCounts types
  prisma/
    schema.prisma         # Full data model (32 models, 15 enums)
  docs/
    architecture.md       # This file
  wrangler.jsonc          # Cloudflare Workers config
  vite.config.ts          # Vite build config
```

## PWA Support

The app is configured as a Progressive Web App via `vite-plugin-pwa`. This provides:

- **Web App Manifest** -- Enables "Add to Home Screen" on mobile devices with app name, icons, and theme colors.
- **Service Worker** -- Caches the app shell (HTML, JS, CSS) for fast subsequent loads.
- **Standalone Display Mode** -- When installed, the app runs in its own window without browser chrome, providing a native app experience.

## Development Notes

- **Local dev**: `shimQueuesForLocalDev()` provides an in-process queue shim so pipeline stages can be tested locally without Cloudflare infrastructure.
- **Database**: Prisma 7 with the Cloudflare runtime adapter. After `prisma generate`, a manual barrel export at `src/generated/prisma/index.ts` is needed (gitignored). A separate `prisma-node` output is generated for scripts that run under Node.js.
- **npm installs**: Require `--legacy-peer-deps` due to Clerk version constraints.
- **Neon free tier**: Expect 5-10s cold starts on first database request.
- **Tests**: Run in batches to avoid OOM (`NODE_OPTIONS="--max-old-space-size=4096"` if running all at once).
