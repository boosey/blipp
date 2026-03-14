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
| Task Queues | 7 Cloudflare Queues |
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
  queue     -->  7 queue consumers (pipeline stages)
  scheduled -->  Cron trigger (*/30) for feed refresh + daily pricing refresh

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
- **`scheduled`** -- Cron trigger (every 30 minutes) that enqueues feed refresh jobs (gated by `pipeline.enabled` config and interval throttle) and refreshes AI model pricing daily.

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
- When all jobs for a request complete, assembly is triggered.
- Partial assembly is supported: if some jobs fail, the briefing is assembled from successful ones.

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
| `Subscription` | User-to-podcast subscriptions with per-subscription duration tier |

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
```

## Middleware Stack

All `/api/*` routes pass through three global middleware layers in `worker/index.ts`:

1. **CORS** (`hono/cors`) — standard CORS headers
2. **Clerk auth** (`worker/middleware/auth.ts`) — populates auth context from JWT
3. **Prisma** (`worker/middleware/prisma.ts`) — creates per-request PrismaClient on `c.get("prisma")` and disconnects via `waitUntil`

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

12 route modules: dashboard, podcasts, episodes, pipeline, config, users, analytics, briefings, requests, plans, stt-benchmark, ai-models.

Notable admin endpoints:
- `POST /api/admin/requests/test-briefing` -- Trigger a test briefing with specific podcast/episode selection
- `GET /api/admin/pipeline` -- Pipeline status and job listing
- `GET/PATCH /api/admin/config` -- Runtime configuration management
- `GET/POST /api/admin/ai-models` -- AI model registry management
- `GET/POST /api/admin/stt-benchmark/experiments` -- STT benchmark experiments
- `GET/POST/PATCH/DELETE /api/admin/plans` -- Plan CRUD management

## Frontend Architecture

### Build & Serving

The frontend is built with Vite 7 using `@cloudflare/vite-plugin` in SPA mode. The Cloudflare Worker serves built assets via the `ASSETS` binding, with all non-API routes falling through to `index.html` for client-side routing.

### Page Structure

| Section | Pages | Layout |
|---------|-------|--------|
| Public | Landing (`/`), Pricing (`/pricing`) | Minimal |
| User | Home (`/home`), Discover (`/discover`), Podcast Detail (`/discover/:podcastId`), Library (`/library`), Player (`/play/:feedItemId`), Settings (`/settings`) | `MobileLayout` |
| Admin | 11 pages (Command Center, Pipeline, Catalog, Briefings, Users, Plans, Analytics, Configuration, Requests, STT Benchmark, Model Registry) | `AdminLayout` (dark sidebar) |

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
        index.ts          # Admin route tree (12 modules)
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
    queues/
      index.ts            # Queue dispatcher + scheduled handler
      feed-refresh.ts     # Periodic RSS polling (standalone cron job)
      transcription.ts    # Pipeline stage 2: Transcript fetching
      distillation.ts     # Pipeline stage 3: LLM claim extraction
      narrative-generation.ts # Pipeline stage 4: LLM narrative writing
      audio-generation.ts    # Stage 5: TTS audio rendering
      briefing-assembly.ts   # Stage 6: Briefing creation + FeedItem linking
      orchestrator.ts     # Pipeline coordination
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
      admin/              # 11 admin pages
        command-center.tsx
        pipeline.tsx
        catalog.tsx
        briefings.tsx
        users.tsx
        plans.tsx
        analytics.tsx
        configuration.tsx
        requests.tsx
        stt-benchmark.tsx
        model-registry.tsx
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
    schema.prisma         # Full data model (20 models, 15 enums)
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
