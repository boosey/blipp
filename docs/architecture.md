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
| `BRIEFING_ASSEMBLY_QUEUE` | Queue | Stage 5: MP3 concatenation |
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
| briefing-assembly | `BRIEFING_ASSEMBLY_QUEUE` | 5 | 3 | 5 - MP3 assembly |
| orchestrator | `ORCHESTRATOR_QUEUE` | 10 | 3 | Coordination |

### Pipeline Architecture

The pipeline is **demand-driven**: only feed refresh runs on a cron schedule. All other stages are triggered by a user requesting a briefing.

1. **Feed Refresh (Stage 1)** -- Polls RSS feeds, upserts new episodes into the database. Runs on cron (`*/30 * * * *`), gated by runtime config.
2. **Transcription (Stage 2)** -- Three-tier transcript waterfall: (1) RSS feed transcript URL, (2) Podcast Index API lookup by episode GUID, (3) Whisper STT with chunked transcription for files over 25MB.
3. **Distillation (Stage 3)** -- Sends transcript to Anthropic Claude for claim extraction and narrative generation. Stores results in Distillation model.
4. **Clip Generation (Stage 4)** -- Generates audio clips via OpenAI gpt-4o-mini-tts. Stores MP3s in R2, metadata in Clip model.
5. **Briefing Assembly (Stage 5)** -- Concatenates clips (with ads for free-tier users), stores final briefing MP3 in R2, creates Briefing + BriefingSegment records.

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

### Output Models

| Model | Purpose |
|-------|---------|
| `Briefing` | Assembled audio briefing (R2 URL, duration, linked to request) |
| `BriefingSegment` | Individual segments within a briefing |

### Configuration

| Model | Purpose |
|-------|---------|
| `PlatformConfig` | Key-value runtime configuration store |

### Key Relations

```
User ---< Subscription >--- Podcast ---< Episode
User ---< BriefingRequest ---< PipelineJob ---< PipelineStep
BriefingRequest --- Briefing ---< BriefingSegment
Episode ---< Distillation ---< Clip
Episode ---< WorkProduct
PipelineStep --- WorkProduct
```

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
| POST | `/podcasts/subscribe` | Subscribe to a podcast |
| POST | `/podcasts/unsubscribe` | Unsubscribe from a podcast |
| GET | `/podcasts/subscriptions` | List user subscriptions |
| GET | `/briefings` | List user briefings |
| GET | `/briefings/today` | Today's briefing |
| POST | `/briefings/generate` | Request a new briefing |
| GET | `/briefings/preferences` | Briefing preferences |
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
| User | Dashboard, Discover, Settings, Billing | `AppLayout` |
| Admin | 9 pages (Command Center, Pipeline, Catalog, Episodes, Briefings, Users, Analytics, Configuration, Requests) | `AdminLayout` (dark sidebar) |

Admin pages are lazy-loaded via `React.lazy()` for code splitting. An `AdminGuard` component wraps admin routes and checks the user's admin status before rendering.

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
      podcasts.ts         # Search, subscribe, trending
      briefings.ts        # Briefing generation + listing
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
      briefing-assembly.ts # Stage 5: MP3 assembly
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
    pages/                # User-facing pages
    pages/admin/          # 9 admin pages
    layouts/
      app-layout.tsx      # User page layout
      admin-layout.tsx    # Admin dark sidebar layout
    components/           # Shared UI components
    lib/
      api.ts              # User API client
      admin-api.ts        # Admin API client with auth
    providers/
      clerk-provider.tsx  # ClerkProvider wrapper
    types/
      admin.ts            # Shared admin type contracts
  prisma/
    schema.prisma         # Full data model
  docs/
    architecture.md       # This file
  wrangler.jsonc          # Cloudflare Workers config
  vite.config.ts          # Vite build config
  tailwind.config.ts      # Tailwind CSS config
```

## Development Notes

- **Local dev**: `shimQueuesForLocalDev()` provides an in-process queue shim so pipeline stages can be tested locally without Cloudflare infrastructure.
- **Database**: Prisma 7 with the Cloudflare runtime adapter. After `prisma generate`, a manual barrel export at `src/generated/prisma/index.ts` is needed (gitignored).
- **npm installs**: Require `--legacy-peer-deps` due to Clerk version constraints.
- **Neon free tier**: Expect 5-10s cold starts on first database request.
- **Tests**: Run in batches to avoid OOM (`NODE_OPTIONS="--max-old-space-size=4096"` if running all at once).
