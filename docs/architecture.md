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
| Task Queues | 6 Cloudflare Queues |
| Frontend | React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui |
| AI (Summarization) | Anthropic Claude (configurable model) |
| AI (STT) | OpenAI Whisper (configurable model) |
| AI (TTS) | OpenAI TTS (configurable model) |
| Podcast Discovery | Podcast Index API |

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
     | Cloudflare R2  |  | Stripe         |   | Podcast Index |
     | (audio/clips)  |  | (billing)      |   | (discovery)   |
     +----------------+  +----------------+   +---------------+

  Worker Handlers:
  ================
  fetch     -->  Hono HTTP server (API + SPA asset serving)
  queue     -->  6 queue consumers (pipeline stages)
  scheduled -->  Cron trigger (*/30) for feed refresh

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
    |     +-----------> | 4. Clip Gen  | <-- | 3. Distill-  |
    |                   |  (TTS)       |     |    ation     |
    |                   +------+-------+     +--------------+
    |                          |
    |                   +------v-------+
    +-------------------| 5. Briefing  |
      (stage reports)   |    Assembly  |
                        +--------------+
```

## Worker Entry Point

The worker (`worker/index.ts`) exports three handlers:

- **`fetch`** -- Hono HTTP server handling all API requests and serving the SPA via Cloudflare Assets.
- **`queue`** -- Dispatches incoming queue messages to the appropriate stage consumer based on queue name.
- **`scheduled`** -- Cron trigger (every 30 minutes) that enqueues feed refresh jobs, gated by `pipeline.enabled` config and interval throttle.

All three handlers pass the environment through `shimQueuesForLocalDev()` which provides a local queue shim during development.

## Environment Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `ASSETS` | Fetcher | SPA static assets |
| `HYPERDRIVE` | Hyperdrive | PostgreSQL connection pooling |
| `R2` | R2Bucket | Audio clips and assembled briefings |
| `FEED_REFRESH_QUEUE` | Queue | Stage 1: RSS feed polling |
| `TRANSCRIPTION_QUEUE` | Queue | Stage 2: Transcript fetching |
| `DISTILLATION_QUEUE` | Queue | Stage 3: Claim extraction via Claude |
| `CLIP_GENERATION_QUEUE` | Queue | Stage 4: TTS via OpenAI |
| `BRIEFING_ASSEMBLY_QUEUE` | Queue | Stage 5: Briefing creation + FeedItem linking |
| `ORCHESTRATOR_QUEUE` | Queue | Pipeline coordination |
| `CLERK_SECRET_KEY` | string | Clerk authentication |
| `CLERK_PUBLISHABLE_KEY` | string | Clerk frontend auth |
| `CLERK_WEBHOOK_SECRET` | string | Clerk webhook verification |
| `STRIPE_SECRET_KEY` | string | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | string | Stripe webhook verification |
| `ANTHROPIC_API_KEY` | string | Claude API for distillation |
| `OPENAI_API_KEY` | string | OpenAI TTS |
| `PODCAST_INDEX_KEY` | string | Podcast Index API |
| `PODCAST_INDEX_SECRET` | string | Podcast Index API |

## Queue System

| Queue | Binding | Batch Size | Retries | Stage |
|-------|---------|-----------|---------|-------|
| feed-refresh | `FEED_REFRESH_QUEUE` | 10 | 3 | 1 - RSS polling |
| transcription | `TRANSCRIPTION_QUEUE` | 5 | 3 | 2 - Transcript fetch |
| distillation | `DISTILLATION_QUEUE` | 5 | 3 | 3 - Claim extraction |
| clip-generation | `CLIP_GENERATION_QUEUE` | 3 | 3 | 4 - TTS generation |
| briefing-assembly | `BRIEFING_ASSEMBLY_QUEUE` | 5 | 3 | 5 - Briefing creation |
| orchestrator | `ORCHESTRATOR_QUEUE` | 10 | 3 | Coordination |

### Pipeline Architecture

The pipeline is **demand-driven**: only feed refresh runs on a cron schedule. All other stages are triggered by a user requesting a briefing.

1. **Feed Refresh (Stage 1)** -- Polls RSS feeds, upserts new episodes into the database. Runs on cron (`*/30 * * * *`), gated by runtime config.
2. **Transcription (Stage 2)** -- Three-tier transcript waterfall: (1) RSS feed transcript URL, (2) Podcast Index API lookup by episode GUID, (3) Whisper STT with chunked transcription for files over 25MB.
3. **Distillation (Stage 3)** -- Sends transcript to Anthropic Claude for claim extraction and narrative generation. Stores results in Distillation model.
4. **Clip Generation (Stage 4)** -- Generates audio clips via OpenAI gpt-4o-mini-tts. Stores MP3s in R2, metadata in Clip model.
5. **Briefing Assembly (Stage 5)** -- Creates per-user Briefing records wrapping shared Clips, then updates FeedItems to READY with briefingId on success, FAILED on failure.

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
| `ai.stt.model` | STT model selection (default: `whisper-1`) |
| `ai.distillation.model` | Distillation model selection (default: `claude-sonnet-4-20250514`) |
| `ai.narrative.model` | Narrative model selection (default: `claude-sonnet-4-20250514`) |
| `ai.tts.model` | TTS model selection (default: `gpt-4o-mini-tts`) |

Each queue handler checks its stage-enabled gate before processing. Messages with `type: "manual"` bypass the gate (for admin-triggered runs).

## Database Schema

### Core Models

| Model | Purpose |
|-------|---------|
| `Plan` | Subscription tiers (free, pro, etc.) |
| `User` | User profile with Clerk ID, Stripe customer ID, `isAdmin` flag |
| `Podcast` | Podcast metadata (title, feed URL, image) |
| `Episode` | Individual episodes linked to podcasts |
| `Subscription` | User-to-podcast subscriptions |

### Pipeline Models

| Model | Purpose |
|-------|---------|
| `BriefingRequest` | User's request for a briefing (PENDING -> PROCESSING -> COMPLETED/FAILED) |
| `PipelineJob` | One episode + duration tier per request. Flows through stages. |
| `PipelineStep` | Audit trail per stage execution (started, completed, failed, duration) |
| `Distillation` | Cached claim extraction results for an episode |
| `Clip` | Cached TTS audio clip for a distillation segment |
| `WorkProduct` | Generic keyed work product store for pipeline stages |

### Delivery Models

| Model | Purpose |
|-------|---------|
| `Briefing` | Per-user wrapper around a shared Clip (will carry personalized ad audio) |
| `FeedItem` | Per-user feed entry, points to a Briefing (or Digest in future) |

### Configuration

| Model | Purpose |
|-------|---------|
| `PlatformConfig` | Key-value runtime configuration store |

### Key Relations

```
User ---< Subscription >--- Podcast ---< Episode
User ---< Briefing >--- Clip
User ---< FeedItem >--- Episode
FeedItem --- Briefing (via briefingId)
User ---< BriefingRequest ---< PipelineJob ---< PipelineStep
Episode ---< Distillation ---< Clip
Episode ---< WorkProduct
PipelineStep --- WorkProduct
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
| `getCurrentUser(c, prisma)` | `worker/lib/admin-helpers.ts` | Resolve Clerk auth to DB User |
| `checkStageEnabled()` | `worker/lib/queue-helpers.ts` | Pipeline stage gate (config + manual bypass) |
| `useFetch<T>(endpoint)` | `src/lib/use-fetch.ts` | Frontend data-fetching hook with loading/error state |

## Authentication & Authorization

### Auth Flow

1. Clerk middleware is applied globally to all `/api/*` routes in `worker/index.ts`.
2. **`requireAuth`** middleware (`worker/middleware/auth.ts`) checks `getAuth(c)?.userId` and returns 401 if missing.
3. **`requireAdmin`** middleware (`worker/middleware/admin.ts`) additionally looks up the User by `clerkId` and checks the `isAdmin` field, returning 403 if not an admin.

### Route Protection

| Route Pattern | Auth Level |
|--------------|------------|
| `/api/plans` | Public |
| `/api/webhooks/*` | Webhook signature verification |
| `/api/podcasts/*` | `requireAuth` |
| `/api/briefings/*` | `requireAuth` |
| `/api/feed/*` | `requireAuth` |
| `/api/billing/*` | `requireAuth` |
| `/api/admin/*` | `requireAdmin` |

## API Route Tree

### Public Routes (`/api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/plans` | List subscription plans |
| POST | `/webhooks/clerk` | Clerk user sync webhook |
| POST | `/webhooks/stripe` | Stripe payment webhook |
| GET | `/health` | Health check |

### Auth-Protected Routes (`/api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/podcasts/search` | Search podcasts via Podcast Index |
| GET | `/podcasts/trending` | Trending podcasts |
| GET | `/podcasts/:id` | Podcast detail with subscription status |
| GET | `/podcasts/:id/episodes` | Episode list for a podcast |
| POST | `/podcasts/subscribe` | Subscribe to a podcast (requires durationTier) |
| PATCH | `/podcasts/subscribe/:podcastId` | Update subscription durationTier |
| DELETE | `/podcasts/subscribe/:podcastId` | Unsubscribe from a podcast |
| GET | `/podcasts/subscriptions` | List user subscriptions |
| POST | `/briefings/generate` | Create on-demand briefing (requires podcastId + durationTier) |
| GET | `/feed` | Paginated feed items |
| GET | `/feed/counts` | Feed item counts |
| GET | `/feed/:id` | Feed item detail with clip |
| PATCH | `/feed/:id/listened` | Mark feed item as listened |
| POST | `/billing/checkout` | Create Stripe checkout session |
| POST | `/billing/portal` | Create Stripe customer portal session |

### Admin Routes (`/api/admin`)

9 route modules: dashboard, podcasts, pipeline, config, users, analytics, briefings, episodes, requests.

Notable admin endpoints:
- `POST /api/admin/requests/test-briefing` -- Trigger a test briefing with specific podcast/episode selection
- `GET /api/admin/pipeline` -- Pipeline status and job listing
- `GET/PUT /api/admin/config` -- Runtime configuration management

## Frontend Architecture

### Build & Serving

The frontend is built with Vite 7 using `@cloudflare/vite-plugin` in SPA mode. The Cloudflare Worker serves built assets via the `ASSETS` binding, with all non-API routes falling through to `index.html` for client-side routing.

### Page Structure

| Section | Pages | Layout |
|---------|-------|--------|
| Public | Landing (`/`), Pricing (`/pricing`) | Minimal |
| User | Home (`/home`), Discover (`/discover`), Podcast Detail (`/discover/:podcastId`), Library (`/library`), Player (`/play/:feedItemId`), Settings (`/settings`) | `MobileLayout` |
| Admin | 9 pages (Command Center, Pipeline, Catalog, Episodes, Briefings, Users, Analytics, Configuration, Requests) | `AdminLayout` (dark sidebar) |

Redirects: `/dashboard` redirects to `/home`, `/billing` redirects to `/settings`, `/briefing/*` redirects to `/home`.

Admin pages are lazy-loaded via `React.lazy()` for code splitting. An `AdminGuard` component wraps admin routes and checks the user's admin status before rendering.

### Mobile-First User App

The user-facing app uses `MobileLayout`, a mobile-first layout with a bottom tab navigation bar (`BottomNav`). The four tabs are:

| Tab | Route | Page |
|-----|-------|------|
| Home | `/home` | `home.tsx` -- Feed view with subscription and on-demand items |
| Discover | `/discover` | `discover.tsx` -- Podcast search and trending (mobile-optimized) |
| Library | `/library` | `library.tsx` -- User's subscriptions and briefing history |
| Settings | `/settings` | `settings.tsx` -- Account settings and billing |

Additional user pages outside the tab bar:
- **Podcast Detail** (`/discover/:podcastId`) -- `podcast-detail.tsx`, episode list, subscribe with tier picker, on-demand briefing
- **Player** (`/play/:feedItemId`) -- `briefing-player.tsx`, audio playback for a completed feed item clip

The discover page uses `PodcastCard` components backed by the `useApiFetch` hook for data loading.

### Design System

- **Admin theme**: Dark navy (`#0A1628` background, `#1A2942` cards, `#3B82F6` accents, Inter font)
- **Component library**: shadcn/ui (22 components installed)
- **CSS**: Tailwind CSS v4 with `tw-animate-css`

### Key Frontend Modules

| File | Purpose |
|------|---------|
| `src/App.tsx` | Route definitions and layout assignments |
| `src/lib/api.ts` | API client for user-facing endpoints |
| `src/lib/admin-api.ts` | `useAdminFetch()` hook with Clerk Bearer token |
| `src/types/admin.ts` | Shared type contracts for admin API responses |
| `src/providers/clerk-provider.tsx` | ClerkProvider wrapper |

## File Structure

```
blipp/
  worker/
    index.ts              # Entry point (fetch/queue/scheduled)
    types.ts              # Env type with all bindings
    middleware/
      auth.ts             # requireAuth (Clerk)
      admin.ts            # requireAdmin (isAdmin check)
    routes/
      index.ts            # Route tree assembly
      plans.ts            # Public plan listing
      podcasts.ts         # Search, subscribe, trending, detail
      briefings.ts        # On-demand briefing generation
      feed.ts             # Feed item list, detail, listened, counts
      billing.ts          # Stripe checkout/portal
      webhooks/
        clerk.ts          # User sync webhook
        stripe.ts         # Payment webhook
      admin/
        dashboard.ts      # Command center stats
        podcasts.ts       # Podcast catalog management
        pipeline.ts       # Pipeline monitoring
        config.ts         # Runtime configuration
        users.ts          # User management
        analytics.ts      # Usage analytics
        briefings.ts      # Briefing inspection
        episodes.ts       # Episode management
        requests.ts       # Briefing request management
    queues/
      index.ts            # Queue dispatcher + scheduled handler
      feed-refresh.ts     # Stage 1: RSS polling
      transcription.ts    # Stage 2: Transcript fetching
      distillation.ts     # Stage 3: Claude claim extraction
      clip-generation.ts  # Stage 4: OpenAI TTS
      briefing-assembly.ts # Stage 5: Briefing creation + FeedItem linking
      orchestrator.ts     # Pipeline coordination
    lib/
      db.ts               # PrismaClient factory (Hyperdrive)
      config.ts           # Runtime config with 60s TTL cache
      podcast-index.ts    # Podcast Index API client
      rss-parser.ts       # RSS feed parser
      transcript.ts       # Transcript fetching
      transcript-source.ts # Podcast Index transcript lookup
      whisper-chunked.ts  # Chunked Whisper for large files
      ai-models.ts        # AI model registry + config helper
      distillation.ts     # Claude summarization
      clip-cache.ts       # Clip cache lookup
      time-fitting.ts     # Duration tier fitting
      tts.ts              # OpenAI TTS generation
      mp3-concat.ts       # Audio concatenation
      stripe.ts           # Stripe client factory
      logger.ts           # Pipeline logger
      local-queue.ts      # Local dev queue shim
  src/
    App.tsx               # Routes + layouts
    main.tsx              # React entry point
    pages/
      home.tsx            # Home tab - briefing overview
      discover.tsx        # Discover tab - podcast search (mobile)
      podcast-detail.tsx  # Podcast detail with episodes
      library.tsx         # Library tab - subscriptions & history
      briefing-player.tsx # Audio playback for briefings
      settings.tsx        # Settings tab - account & billing
      admin/              # 9 admin pages
    layouts/
      mobile-layout.tsx   # Mobile-first layout with bottom nav
      admin-layout.tsx    # Admin dark sidebar layout
    components/
      bottom-nav.tsx      # Bottom tab navigation bar
      status-badge.tsx    # Status indicator badge
      feed-item.tsx       # Feed item card (podcast, episode, status, play)
      podcast-card.tsx    # Podcast card (uses useApiFetch)
      ...                 # Other shared UI components
    lib/
      api.ts              # User API client
      admin-api.ts        # Admin API client with auth
    providers/
      clerk-provider.tsx  # ClerkProvider wrapper
    types/
      admin.ts            # Shared admin type contracts
      user.ts             # User-facing type contracts
      feed.ts             # FeedItem and FeedCounts types
  prisma/
    schema.prisma         # Full data model
  docs/
    architecture.md       # This file
  wrangler.jsonc          # Cloudflare Workers config
  vite.config.ts          # Vite build config
  tailwind.config.ts      # Tailwind CSS config
```

## PWA Support

The app is configured as a Progressive Web App via `vite-plugin-pwa`. This provides:

- **Web App Manifest** -- Enables "Add to Home Screen" on mobile devices with app name, icons, and theme colors.
- **Service Worker** -- Caches the app shell (HTML, JS, CSS) for fast subsequent loads.
- **Standalone Display Mode** -- When installed, the app runs in its own window without browser chrome, providing a native app experience.

## Development Notes

- **Local dev**: `shimQueuesForLocalDev()` provides an in-process queue shim so pipeline stages can be tested locally without Cloudflare infrastructure.
- **Database**: Prisma 7 with the Cloudflare runtime adapter. After `prisma generate`, a manual barrel export at `src/generated/prisma/index.ts` is needed (gitignored).
- **npm installs**: Require `--legacy-peer-deps` due to Clerk version constraints.
- **Neon free tier**: Expect 5-10s cold starts on first database request.
- **Tests**: Run in batches to avoid OOM (`NODE_OPTIONS="--max-old-space-size=4096"` if running all at once).
