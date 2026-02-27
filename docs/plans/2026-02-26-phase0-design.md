# Blipp Phase 0: "The Daily Briefing" — Architecture Design

**Date:** 2026-02-26
**Status:** Approved

---

## Goal

Build a launch-ready MVP where users subscribe to podcasts, set a briefing length, and receive a daily audio briefing distilled from new episodes — with a cached clip architecture that makes costs nearly flat regardless of user count.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | **Vite + React** (SPA on Cloudflare Pages) | Already proven in existing app, no adapter layers |
| Backend API | **Hono** on Cloudflare Workers | Cloudflare-native, full Workers API access |
| Auth | **Clerk** | Managed auth, JWT with custom metadata, webhooks |
| Payments | **Stripe** | Checkout + Customer Portal + webhooks |
| Database | **Neon PostgreSQL** + Cloudflare **Hyperdrive** | Full PostgreSQL features, connection pooling at edge |
| ORM | **Prisma** | Type-safe queries, keeps existing schema |
| Storage | **Cloudflare R2** | Cached clips, ad clips, zero egress fees |
| Background Jobs | **Cloudflare Queues** → Worker consumers | Native to platform, no external job service |
| TTS | **OpenAI gpt-4o-mini-tts** | Best price-to-quality, steerable voice |
| Distillation | **Anthropic Claude** (Sonnet) | Two-pass: claims extraction + narrative generation |
| Podcast Data | **Podcast Index API** + RSS parsing | Free, 4M+ podcasts, Podcasting 2.0 support |
| Audio Concat | **Simple MP3 frame concat** (JS in Worker) | No ffmpeg needed — segments share format/bitrate |
| DNS/CDN | **Cloudflare** | Unified with compute platform |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Pages                       │
│              Vite + React SPA (Frontend)                │
└──────────────────────┬──────────────────────────────────┘
                       │ API calls
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 Cloudflare Workers                        │
│                  Hono API Server                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ Auth     │  │ Podcast  │  │ Briefing  │             │
│  │ (Clerk)  │  │ Routes   │  │ Routes    │             │
│  └──────────┘  └──────────┘  └───────────┘             │
│                                                          │
│  ┌──────────────────┐  ┌────────────────────┐          │
│  │ Stripe Webhooks  │  │ Clerk Webhooks     │          │
│  └──────────────────┘  └────────────────────┘          │
└──────┬──────────────────────┬───────────────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  Cloudflare  │    │ Neon PostgreSQL  │    │ Cloudflare   │
│  Queues      │    │ (via Hyperdrive) │    │ R2           │
│              │    │                  │    │ (clips, ads) │
└──────┬───────┘    └─────────────────┘    └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│              Queue Consumer Workers                      │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐                │
│  │ Distillation   │  │ Briefing       │                │
│  │ Pipeline       │  │ Assembly       │                │
│  │                │  │                │                │
│  │ 1. Fetch RSS   │  │ 1. Get user    │                │
│  │ 2. Get transcript│ │    subs       │                │
│  │ 3. Claude P1   │  │ 2. Find cached │                │
│  │ 4. Claude P2   │  │    clips       │                │
│  │ 5. OpenAI TTS  │  │ 3. Generate    │                │
│  │ 6. Store in R2 │  │    missing     │                │
│  └────────────────┘  │ 4. Insert ads  │                │
│                      │    (free tier) │                │
│                      │ 5. Concat MP3s │                │
│                      │ 6. Store in R2 │                │
│                      └────────────────┘                │
└─────────────────────────────────────────────────────────┘

External APIs: Podcast Index, Anthropic Claude, OpenAI TTS
```

---

## Clip Caching Architecture

### Core Concept

A **clip** = `(episodeId, durationTier)`. Once generated, it's stored in R2 and never regenerated. User briefings are assembled by concatenating cached clips.

### Duration Tiers

Quantized to: **1, 2, 3, 5, 7, 10, 15 minutes**

When proportional allocation gives a user 2:47 for an episode, it rounds to the **3-min tier**. This maximizes cache hits across users with different subscription counts and briefing lengths.

### R2 Key Structure

```
clips/{episodeId}/{durationTier}.mp3       # cached content clips
ads/{adId}.mp3                              # pre-recorded ad clips
briefings/{userId}/{date}.mp3               # assembled briefings
```

### Generation Flow

```
New episode detected
  → Check: does clip exist for requested duration tier?
    → Yes: skip generation, use cached
    → No:
      1. Check: do claims exist for this episode?
         → No: Run Claude Pass 1 (claims extraction)
      2. Run Claude Pass 2 (narrative at target word count)
      3. Run OpenAI TTS on narrative
      4. Upload clip to R2
      5. Record in DB (Distillation + Clip records)
```

### Briefing Assembly Flow

```
Scheduled briefing trigger (per user)
  1. Get user's subscriptions
  2. Find latest episode per subscription
  3. Calculate proportional time allocation
  4. Round each allocation to nearest duration tier
  5. Look up cached clips in R2
  6. Queue generation for any missing clips
  7. Once all clips ready:
     - Free tier: interleave ad clips (10/15/20s based on content clip duration)
     - Pro tier: content clips only
  8. Concatenate all MP3s (frame-level join)
  9. Upload final briefing to R2
  10. Notify user
```

---

## Data Model

### Prisma Schema (Key Models)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Auth & Billing ──

model User {
  id                    String   @id @default(cuid())
  clerkId               String   @unique
  email                 String   @unique
  name                  String?
  imageUrl              String?
  stripeCustomerId      String?  @unique
  tier                  UserTier @default(FREE)
  briefingLengthMinutes Int      @default(15)
  briefingTime          String   @default("07:00") // HH:MM in user's timezone
  timezone              String   @default("America/New_York")
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  subscriptions Subscription[]
  briefings     Briefing[]
}

enum UserTier {
  FREE
  PRO
  PRO_PLUS
}

// ── Podcast & Episodes ──

model Podcast {
  id             String   @id @default(cuid())
  title          String
  description    String?
  feedUrl        String   @unique
  imageUrl       String?
  podcastIndexId String?  @unique
  author         String?
  categories     String[] // PostgreSQL array
  lastFetchedAt  DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  episodes      Episode[]
  subscriptions Subscription[]
}

model Episode {
  id              String   @id @default(cuid())
  podcastId       String
  title           String
  description     String?
  audioUrl        String
  publishedAt     DateTime
  durationSeconds Int?
  guid            String
  transcriptUrl   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  podcast      Podcast       @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  distillation Distillation?
  clips        Clip[]

  @@unique([podcastId, guid])
}

// ── Distillation & Clips ──

model Distillation {
  id           String             @id @default(cuid())
  episodeId    String             @unique
  status       DistillationStatus @default(PENDING)
  transcript   String?
  claimsJson   Json?              // Pass 1 output: scored claims
  errorMessage String?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  clips   Clip[]
}

enum DistillationStatus {
  PENDING
  FETCHING_TRANSCRIPT
  EXTRACTING_CLAIMS
  COMPLETED
  FAILED
}

model Clip {
  id             String     @id @default(cuid())
  episodeId      String
  distillationId String
  durationTier   Int        // 1, 2, 3, 5, 7, 10, or 15 (minutes)
  status         ClipStatus @default(PENDING)
  narrativeText  String?    // Pass 2 output: narrative for TTS
  wordCount      Int?
  audioKey       String?    // R2 key: clips/{episodeId}/{durationTier}.mp3
  audioUrl       String?    // Public R2 URL
  actualSeconds  Int?       // Actual TTS audio duration
  errorMessage   String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  episode      Episode      @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  distillation Distillation @relation(fields: [distillationId], references: [id], onDelete: Cascade)

  @@unique([episodeId, durationTier])
}

enum ClipStatus {
  PENDING
  GENERATING_NARRATIVE
  GENERATING_AUDIO
  COMPLETED
  FAILED
}

// ── User Subscriptions ──

model Subscription {
  id        String   @id @default(cuid())
  userId    String
  podcastId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  podcast Podcast @relation(fields: [podcastId], references: [id], onDelete: Cascade)

  @@unique([userId, podcastId])
}

// ── Briefings ──

model Briefing {
  id            String         @id @default(cuid())
  userId        String
  status        BriefingStatus @default(PENDING)
  targetMinutes Int
  actualSeconds Int?
  audioUrl      String?
  audioKey      String?        // R2 key: briefings/{userId}/{date}.mp3
  errorMessage  String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  segments BriefingSegment[]
}

enum BriefingStatus {
  PENDING
  ASSEMBLING
  GENERATING_AUDIO
  COMPLETED
  FAILED
}

model BriefingSegment {
  id             String @id @default(cuid())
  briefingId     String
  clipId         String
  orderIndex     Int
  adClipKey      String? // R2 key for pre-roll ad (null for Pro users)
  transitionText String  // "Next, from podcast X..."

  briefing Briefing @relation(fields: [briefingId], references: [id], onDelete: Cascade)
}

// ── Ads ──

model AdCampaign {
  id          String   @id @default(cuid())
  name        String
  advertiser  String?
  audioKey10s String?  // R2 key for 10-sec version
  audioKey15s String?  // R2 key for 15-sec version
  audioKey20s String?  // R2 key for 20-sec version
  active      Boolean  @default(true)
  impressions Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Key differences from original schema

- **Removed:** `Account`, `Session`, `VerificationToken` (Clerk handles auth)
- **Added:** `clerkId`, `stripeCustomerId` on `User`
- **Added:** `Clip` model (the cached unit)
- **Added:** `AdCampaign` model
- **Changed:** `Distillation` no longer stores `segmentsJson` — clips handle per-duration output
- **Changed:** `BriefingSegment` references a `clipId` instead of `distillationId`

---

## Auth Flow (Clerk)

```
1. User signs up/in via Clerk
2. Clerk webhook (user.created) → Hono endpoint → create User in DB
3. Clerk middleware on Hono protects API routes
4. Session JWT contains:
   - userId (Clerk ID)
   - publicMetadata.tier (FREE | PRO | PRO_PLUS)
   - email, name, imageUrl
5. API reads tier from JWT — no DB query needed for permission checks
```

---

## Payment Flow (Stripe)

```
1. User clicks "Upgrade to Pro" → API creates Stripe Checkout Session
2. User completes payment on Stripe-hosted page
3. Stripe webhook → Hono endpoint:
   a. checkout.session.completed → set tier in Clerk metadata + DB
   b. customer.subscription.updated → sync tier changes
   c. customer.subscription.deleted → revert to FREE
4. User clicks "Manage subscription" → Stripe Customer Portal
```

Stripe Customer ID stored on User model. Tier is the source of truth in Stripe, reflected in both Clerk metadata (for fast JWT access) and DB (for queries/reports).

---

## Background Job Architecture (Cloudflare Queues)

### Queue Types

| Queue | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `feed-refresh` | Cron trigger (every 30 min) | Feed refresh Worker | Poll RSS feeds for new episodes |
| `distillation` | Feed refresh Worker | Distillation Worker | Fetch transcript + extract claims |
| `clip-generation` | Briefing assembly or on-demand | Clip generation Worker | Generate narrative + TTS for a specific (episode, tier) |
| `briefing-assembly` | Cron trigger (per user schedule) | Briefing assembly Worker | Assemble clips into final briefing |

### Worker CPU Considerations

- Paid Workers plan: 30s CPU time per invocation (default), 15 min for Queue consumers
- Claude API calls are wall-clock time (network I/O), not CPU time — fits within limits
- OpenAI TTS calls are network I/O — fits within limits
- MP3 concat is CPU-bound but fast for small files

---

## Cloudflare Workers Compatibility Notes

### Node.js API Replacements

| Original Plan | Cloudflare Workers | Notes |
|--------------|-------------------|-------|
| `crypto.createHash('sha1')` | `crypto.subtle.digest('SHA-1', ...)` | Web Crypto API |
| `rss-parser` | Need Workers-compatible XML parser | Test compatibility; may need alternative |
| `fluent-ffmpeg` | Removed | Simple JS MP3 concat instead |
| `ffmpeg-static` | Removed | Not needed |
| `fs.writeFile` | R2 `put()` | All file I/O goes to R2 |
| `Buffer` | `ArrayBuffer` / `Uint8Array` | Workers support Buffer with nodejs_compat |

### Wrangler Configuration

```toml
# wrangler.toml
name = "blipp-api"
compatibility_date = "2026-02-26"
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "R2"
bucket_name = "blipp-audio"

[[queues.producers]]
binding = "FEED_REFRESH_QUEUE"
queue = "feed-refresh"

[[queues.producers]]
binding = "DISTILLATION_QUEUE"
queue = "distillation"

[[queues.producers]]
binding = "CLIP_GENERATION_QUEUE"
queue = "clip-generation"

[[queues.producers]]
binding = "BRIEFING_ASSEMBLY_QUEUE"
queue = "briefing-assembly"

[[queues.consumers]]
queue = "feed-refresh"
max_batch_size = 10
max_retries = 3

[[queues.consumers]]
queue = "distillation"
max_batch_size = 5
max_retries = 3

[[queues.consumers]]
queue = "clip-generation"
max_batch_size = 5
max_retries = 3

[[queues.consumers]]
queue = "briefing-assembly"
max_batch_size = 10
max_retries = 3

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<hyperdrive-config-id>"

[triggers]
crons = ["*/30 * * * *"]  # Feed refresh every 30 minutes
```

---

## Frontend Architecture (Vite + React)

### Routing

React Router (or TanStack Router) for client-side routing:

| Route | Page | Auth |
|-------|------|------|
| `/` | Landing page (static) | Public |
| `/sign-in`, `/sign-up` | Clerk auth pages | Public |
| `/dashboard` | Briefing player + subscription overview | Protected |
| `/discover` | Browse/search podcasts | Protected |
| `/settings` | Briefing preferences, account, billing | Protected |
| `/settings/billing` | Stripe Customer Portal redirect | Protected |

### Key Components

- **BriefingPlayer** — Audio player for today's briefing with segment markers
- **PodcastSearch** — Search via Podcast Index API
- **SubscriptionManager** — Add/remove podcast subscriptions
- **BriefingSlider** — Set briefing length (10–30 min for Pro, 5 min max for Free)
- **UpgradePrompt** — Stripe Checkout trigger for Pro/Pro+

---

## MVP Ad System

Phase 0 uses a simple rotation model:

1. Store 5–10 pre-recorded ad clips in R2 (initially house ads promoting Pro tier)
2. During briefing assembly, select ads via round-robin
3. Pick correct ad duration version (10s/15s/20s) based on content clip tier
4. Track impressions by incrementing `AdCampaign.impressions`
5. Swap in programmatic ads later via an `AdProvider` interface

---

## Phase 0 Scope Boundaries

### In Scope
- Podcast search and subscription (curated catalog of ~200 top podcasts with transcripts)
- Daily briefing generation with clip caching
- Audio player with briefing playback
- Clerk auth (email + Google OAuth)
- Stripe billing (Free → Pro upgrade)
- Pre-roll ads on free tier
- Briefing length customization (slider)

### Out of Scope (Phase 1+)
- Research mode
- Discover/swipe mode
- Cross-podcast synthesis
- STT for podcasts without transcripts
- Speaker voice cloning (ElevenLabs)
- Mobile app
- Real-time/live distillation
- Direct ad sales platform
