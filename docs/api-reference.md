# Blipp API Reference

All routes are served by a Hono app on Cloudflare Workers. The API is mounted at `/api`.

## Authentication

- **Clerk auth**: Most routes require a valid Clerk session (Bearer token). The `requireAuth` middleware (`worker/middleware/auth.ts`) returns 401 if no authenticated user.
- **Admin auth**: Admin routes use `requireAdmin` middleware (`worker/middleware/admin.ts`) which checks Clerk auth (401) then `User.isAdmin` (403).
- **Webhooks**: Clerk and Stripe webhook endpoints verify signatures instead of using session auth.
- **Plan limits**: Subscribe and briefing routes enforce plan-based limits (duration, subscriptions, weekly briefings) via helpers in `worker/lib/plan-limits.ts`.

| Route Pattern | Auth Level |
|---------------|------------|
| `GET /api/plans` | None |
| `GET /api/health` | None |
| `POST /api/webhooks/*` | Webhook signature verification |
| `/api/me` | Clerk auth (Bearer token) |
| `/api/plans/current` | Clerk auth (Bearer token) |
| `/api/podcasts/*` | Clerk auth + plan limits |
| `/api/briefings/*` | Clerk auth + plan limits |
| `/api/feed/*` | Clerk auth (Bearer token) |
| `/api/clips/*` | Clerk auth (Bearer token) |
| `/api/billing/*` | Clerk auth (Bearer token) |
| `/api/admin/*` | Clerk auth + `isAdmin` flag |

## Common Patterns

- All routes return JSON
- Errors follow `{ error: "message" }` format
- Paginated endpoints accept `page` and `pageSize` query params
- List endpoints support `search`, `status`, and `sort` query params where applicable
- Prisma client is created per-request and disconnected via `waitUntil`

---

## Public Routes

### Health

**`GET /api/health`**

Returns service health status.

```json
{ "status": "ok", "timestamp": "2026-03-06T12:00:00.000Z" }
```

### Plans

**`GET /api/plans`**

List active subscription plans. No auth required. Returns active plans sorted by `sortOrder`.

```json
[
  {
    "id": "string",
    "slug": "free",
    "name": "Free",
    "description": "string",
    "priceCentsMonthly": 0,
    "priceCentsAnnual": null,
    "features": ["string"],
    "highlighted": false,
    "briefingsPerWeek": 5,
    "maxDurationMinutes": 5,
    "maxPodcastSubscriptions": 3,
    "adFree": false,
    "priorityProcessing": false,
    "earlyAccess": false
  }
]
```

**`GET /api/plans/current`** (requires auth)

Returns the authenticated user's current plan.

```json
{
  "plan": {
    "id": "string",
    "name": "Free",
    "slug": "free",
    "priceCentsMonthly": 0
  }
}
```

---

## Authenticated Routes

All routes below require a valid Clerk session (Bearer token). Returns 401 if unauthenticated.

### Me (`/api/me`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Get/create current user with plan info |

**`GET /api/me`**

Returns the authenticated user's DB record, creating it from Clerk if missing. Auto-assigns the default plan.

Response:
```json
{
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "imageUrl": "string",
    "plan": { "id": "string", "name": "string", "slug": "string" },
    "isAdmin": false
  }
}
```

---

### Podcasts (`/api/podcasts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/podcasts/catalog` | Browse/search local podcast catalog |
| POST | `/api/podcasts/subscribe` | Subscribe to a podcast (requires durationTier) |
| PATCH | `/api/podcasts/subscribe/:podcastId` | Update subscription durationTier |
| DELETE | `/api/podcasts/subscribe/:podcastId` | Unsubscribe from a podcast |
| POST | `/api/podcasts/refresh` | Queue feed refresh |
| GET | `/api/podcasts/subscriptions` | List user's subscriptions |
| GET | `/api/podcasts/:id` | Podcast detail with subscription status + tier |
| GET | `/api/podcasts/:id/episodes` | Episode list (up to 50, newest first) |

**`GET /api/podcasts/catalog?q=...&page=1&pageSize=50`**

Browse/search the local podcast catalog (populated by admin catalog refresh). Searches title and author.

Response:
```json
{
  "podcasts": [
    {
      "id": "string",
      "title": "string",
      "author": "string",
      "description": "string",
      "imageUrl": "string",
      "feedUrl": "string",
      "episodeCount": 0
    }
  ],
  "total": 0,
  "page": 1,
  "pageSize": 50
}
```

**`POST /api/podcasts/subscribe`**

Body:
```json
{
  "feedUrl": "string (required)",
  "title": "string (required)",
  "durationTier": "number (required, one of 1/2/3/5/7/10/15/30)",
  "description": "string",
  "imageUrl": "string",
  "podcastIndexId": "string",
  "author": "string"
}
```

Response (201): `{ "subscription": { "...subscription", "podcast": {...} }, "feedItem": {...} }`

Upserts podcast and subscription. Enforces plan limits (duration, subscription count). Creates a FeedItem (SUBSCRIPTION source) for the latest episode and dispatches the pipeline.

**`PATCH /api/podcasts/subscribe/:podcastId`**

Body:
```json
{ "durationTier": "number (required, one of 1/2/3/5/7/10/15/30)" }
```

Response: `{ "subscription": {...} }`

Enforces plan duration limit.

**`DELETE /api/podcasts/subscribe/:podcastId`**

Response: `{ "success": true }`

**`POST /api/podcasts/refresh`**

Enqueues a manual feed refresh.

Response: `{ "success": true, "message": "string" }`

**`GET /api/podcasts/subscriptions`**

Response: `{ "subscriptions": [{ "...subscription", "podcast": {...} }] }`

**`GET /api/podcasts/:id`**

Returns podcast detail with subscription status for the authenticated user.

Response:
```json
{
  "podcast": {
    "id": "string",
    "title": "string",
    "description": "string",
    "feedUrl": "string",
    "imageUrl": "string",
    "author": "string",
    "podcastIndexId": "string",
    "episodeCount": 0,
    "isSubscribed": true,
    "subscriptionDurationTier": 5
  }
}
```

**`GET /api/podcasts/:id/episodes`**

Returns up to 50 episodes for a podcast, ordered by `publishedAt` descending.

Response:
```json
{
  "episodes": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "publishedAt": "string",
      "durationSeconds": 0
    }
  ]
}
```

---

### Briefings (`/api/briefings`) — On-Demand

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/briefings/generate` | Create an on-demand briefing |

**`POST /api/briefings/generate`**

Creates an on-demand FeedItem and dispatches the pipeline. Enforces plan limits (duration, weekly briefing cap).

Body:
```json
{
  "podcastId": "string (required)",
  "episodeId": "string (optional — defaults to latest episode)",
  "durationTier": "number (required, one of 1/2/3/5/7/10/15/30)"
}
```

Response (201):
```json
{ "feedItem": { "id": "string", "status": "PENDING", "durationTier": 5 } }
```

Response (400): Missing required fields, invalid durationTier, or no episodes found.
Response (403): Plan limit exceeded (duration or weekly briefing cap).

---

### Feed (`/api/feed`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feed` | Paginated list of user's feed items |
| GET | `/api/feed/counts` | Feed item counts (total, unlistened, pending) |
| GET | `/api/feed/:id` | Feed item detail with briefing + clip |
| PATCH | `/api/feed/:id/listened` | Mark a feed item as listened |

**`GET /api/feed`**

Query params: `status` (filter), `listened` (true/false filter), `limit` (default 30, max 100), `offset` (default 0)

Response:
```json
{
  "items": [
    {
      "id": "string",
      "source": "SUBSCRIPTION | ON_DEMAND",
      "status": "PENDING | PROCESSING | READY | FAILED",
      "durationTier": 5,
      "listened": false,
      "listenedAt": null,
      "createdAt": "string",
      "podcast": { "id": "string", "title": "string", "imageUrl": "string" },
      "episode": { "id": "string", "title": "string", "publishedAt": "string", "durationSeconds": 0 },
      "briefing": {
        "id": "string",
        "clip": { "audioUrl": "/api/clips/episodeId/durationTier", "actualSeconds": 300 },
        "adAudioUrl": null
      }
    }
  ],
  "total": 10
}
```

**`GET /api/feed/counts`**

Response:
```json
{ "total": 10, "unlistened": 3, "pending": 1 }
```

**`GET /api/feed/:id`**

Returns a single feed item with full clip detail.

Response: `{ "item": { ... } }` (same shape as feed list items)

**`PATCH /api/feed/:id/listened`**

Marks the feed item as listened. Returns 404 if not found or not owned by user.

Response: `{ "success": true }`

---

### Clips (`/api/clips`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clips/:episodeId/:durationTier` | Stream clip audio from R2 |

**`GET /api/clips/:episodeId/:durationTier`**

Streams MP3 audio from R2 for the given episode and duration tier. Returns `audio/mpeg` with `Cache-Control: public, max-age=86400`.

Response: Binary audio stream
Response (404): Clip not found in R2

---

### Billing (`/api/billing`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/checkout` | Create Stripe Checkout session |
| POST | `/api/billing/portal` | Create Stripe Customer Portal session |

**`POST /api/billing/checkout`**

Body: `{ "planId": "string", "interval": "monthly" | "annual" }`

Response: `{ "url": "https://checkout.stripe.com/..." }`

Returns 400 if plan is invalid, unavailable, or has no Stripe price for the chosen interval.

**`POST /api/billing/portal`**

No body required.

Response: `{ "url": "https://billing.stripe.com/..." }`

Returns 400 if user has never subscribed (no `stripeCustomerId`).

---

## Webhooks

### Clerk (`POST /api/webhooks/clerk`)

Verifies Svix signature. Handles:
- `user.created` -- Creates User record
- `user.updated` -- Updates email, name, imageUrl
- `user.deleted` -- Deletes User record

Response: `{ "received": true }`

### Stripe (`POST /api/webhooks/stripe`)

Requires `stripe-signature` header (400 if missing/invalid). Handles:
- `checkout.session.completed` -- Upgrades user plan based on Stripe price
- `customer.subscription.deleted` -- Reverts user to default (free) plan

Response: `{ "received": true }`

---

## Admin Routes (`/api/admin`)

All admin routes require Clerk auth + `User.isAdmin = true`. Returns 401 if unauthenticated, 403 if not admin.

---

### Dashboard (`/api/admin/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | System health overview |
| GET | `/stats` | Aggregate stat cards with 7-day trends |
| GET | `/activity` | Recent pipeline activity (20 most recent jobs) |
| GET | `/costs` | Today's cost summary by stage |
| GET | `/issues` | Active issues (failed jobs + broken feeds, last 48h) |
| GET | `/feed-refresh-summary` | Feed refresh status |

---

### Pipeline (`/api/admin/pipeline`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | Paginated job list with filters |
| GET | `/jobs/:id` | Job detail with steps and request context |
| POST | `/jobs/:id/retry` | Retry a single failed job |
| POST | `/jobs/bulk/retry` | Bulk retry failed jobs |
| POST | `/trigger/feed-refresh` | Trigger manual feed refresh |
| POST | `/trigger/stage/:stage` | Trigger a specific stage |
| POST | `/trigger/episode/:id` | Trigger pipeline for episode |
| GET | `/stages` | Per-stage aggregate stats |

---

### Podcasts (`/api/admin/podcasts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Catalog statistics |
| GET | `/` | Paginated podcast list |
| GET | `/:id` | Podcast detail with episodes, clips, and pipeline activity |
| POST | `/` | Create podcast |
| PATCH | `/:id` | Update podcast |
| DELETE | `/:id` | Archive podcast (soft delete) |
| POST | `/:id/refresh` | Trigger feed refresh for podcast |

---

### Episodes (`/api/admin/episodes`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated episode list |
| GET | `/:id` | Episode detail with pipeline trace |
| POST | `/:id/reprocess` | Trigger reprocessing |

---

### Briefings (`/api/admin/briefings`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated briefing list (per-user Clip wrappers) |
| GET | `/:id` | Briefing detail with clip, episode, and feed items |

---

### Users (`/api/admin/users`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/segments` | User segment counts |
| GET | `/` | Paginated user list |
| GET | `/:id` | User detail with subscriptions |
| PATCH | `/:id` | Update user (plan, admin toggle) |

---

### Plans (`/api/admin/plans`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated plan list with user counts |
| GET | `/:id` | Plan detail with user count |
| POST | `/` | Create plan |
| PATCH | `/:id` | Update plan fields |
| DELETE | `/:id` | Soft delete (deactivate) plan |

---

### Analytics (`/api/admin/analytics`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/costs` | Cost analytics by stage and period |
| GET | `/costs/by-model` | Cost breakdown by AI model and stage |
| GET | `/usage` | Usage trends and distribution |
| GET | `/quality` | Quality metrics and trends |
| GET | `/pipeline` | Pipeline throughput and bottlenecks |

All analytics endpoints accept `from` and `to` query params (ISO date strings).

---

### Configuration (`/api/admin/config`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All runtime config values grouped by prefix |
| PATCH | `/:key` | Update a config value |
| GET | `/tiers/duration` | Duration tier config |
| PUT | `/tiers/duration` | Update duration tiers |
| GET | `/tiers/subscription` | Subscription plans with user counts |
| PUT | `/tiers/subscription` | Update a subscription plan |
| GET | `/features` | Feature flags |
| PUT | `/features/:id` | Update a feature flag |

---

### Requests (`/api/admin/requests`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated request list with status filter |
| GET | `/:id` | Request detail with job/step progress tree |
| GET | `/work-product/:id/preview` | Preview work product content |
| GET | `/work-product/:id/audio` | Stream work product audio |
| POST | `/test-briefing` | Create admin test briefing request |

---

### AI Models (`/api/admin/ai-models`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List models with providers (optional `?stage=` and `?includeInactive=true`) |
| POST | `/` | Create a new model (stage, modelId, label, developer, notes) |
| PATCH | `/:id` | Update model (isActive, notes) |
| POST | `/:id/providers` | Add a provider to a model |
| PATCH | `/:id/providers/:providerId` | Update provider pricing or availability |
| DELETE | `/:id/providers/:providerId` | Remove a provider |

---

### STT Benchmark (`/api/admin/stt-benchmark`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/eligible-episodes` | Episodes with official transcripts (for WER ground truth) |
| GET | `/episode-audio/:id` | Proxy episode audio (CORS-free, limited to ~15 min) |
| GET | `/episodes/:episodeId/reference-transcript` | Fetch and parse official transcript (VTT/SRT stripped) |
| POST | `/experiments` | Create benchmark experiment |
| GET | `/experiments` | List experiments (paginated) |
| GET | `/experiments/:id` | Experiment detail with status counts |
| POST | `/experiments/:id/run` | Execute next pending task |
| POST | `/experiments/:id/cancel` | Cancel experiment |
| GET | `/experiments/:id/results` | Results with summary grid and winners |
| DELETE | `/experiments/:id` | Delete experiment + R2 cleanup |
| POST | `/upload-audio` | Upload speed-adjusted audio to R2 |
| GET | `/results/:resultId/transcript` | Fetch STT output transcript from R2 |
| GET | `/results/:resultId/reference-transcript` | Fetch cleaned reference transcript from R2 |
