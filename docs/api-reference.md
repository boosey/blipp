# Blipp API Reference

All routes are served by a Hono app on Cloudflare Workers. The API is mounted at `/api`.

## Authentication

- **Clerk auth**: Most routes require a valid Clerk session (Bearer token). The `requireAuth` middleware (`worker/middleware/auth.ts`) returns 401 if no authenticated user.
- **Admin auth**: Admin routes use `requireAdmin` middleware (`worker/middleware/admin.ts`) which checks Clerk auth (401) then `User.isAdmin` (403).
- **Webhooks**: Clerk and Stripe webhook endpoints verify signatures instead of using session auth.

| Route Pattern | Auth Level |
|---------------|------------|
| `GET /api/plans` | None |
| `GET /api/health` | None |
| `POST /api/webhooks/*` | Webhook signature verification |
| `/api/podcasts/*` | Clerk auth (Bearer token) |
| `/api/briefings/*` | Clerk auth (Bearer token) |
| `/api/feed/*` | Clerk auth (Bearer token) |
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
    "tier": "FREE | PRO | PRO_PLUS",
    "name": "string",
    "priceCents": 0,
    "features": ["string"],
    "highlighted": false
  }
]
```

---

## Authenticated Routes

All routes below require a valid Clerk session (Bearer token). Returns 401 if unauthenticated.

### Podcasts (`/api/podcasts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/podcasts/search?q=...` | Search podcasts via Podcast Index |
| GET | `/api/podcasts/trending` | Fetch trending podcasts |
| POST | `/api/podcasts/subscribe` | Subscribe to a podcast (requires durationTier) |
| PATCH | `/api/podcasts/subscribe/:podcastId` | Update subscription durationTier |
| DELETE | `/api/podcasts/subscribe/:podcastId` | Unsubscribe from a podcast |
| POST | `/api/podcasts/refresh` | Queue a feed refresh |
| GET | `/api/podcasts/subscriptions` | List user's subscriptions |
| GET | `/api/podcasts/:id` | Podcast detail with subscription status + tier |
| GET | `/api/podcasts/:id/episodes` | Episode list (up to 50, newest first) |

**`GET /api/podcasts/search?q=...`**

Query param `q` is required (400 if missing).

Response: `{ "feeds": [...] }`

**`GET /api/podcasts/trending`**

Response: `{ "feeds": [...] }`

**`POST /api/podcasts/subscribe`**

Body:
```json
{
  "feedUrl": "string (required)",
  "title": "string (required)",
  "durationTier": "number (required, one of 1/2/3/5/7/10/15/30)",
  "description": "string",
  "imageUrl": "string",
  "podcastIndexId": "number",
  "author": "string"
}
```

Response (201): `{ "subscription": { "...subscription", "podcast": {...} } }`

Upserts podcast and subscription. Creates a FeedItem (SUBSCRIPTION source) for the latest episode and dispatches the pipeline.

**`PATCH /api/podcasts/subscribe/:podcastId`**

Body:
```json
{ "durationTier": "number (required, one of 1/2/3/5/7/10/15/30)" }
```

Response: `{ "subscription": {...} }`

**`DELETE /api/podcasts/subscribe/:podcastId`**

Response: `{ "success": true }`

**`POST /api/podcasts/refresh`**

Enqueues a manual feed refresh for all of the user's subscribed podcasts.

Response: `{ "success": true, "message": "string" }`

**`GET /api/podcasts/subscriptions`**

Response: `{ "subscriptions": [{ "...subscription", "podcast": {...} }] }`

**`GET /api/podcasts/:id`**

Returns podcast detail with subscription status for the authenticated user. Returns 404 if podcast not found.

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

Returns up to 50 episodes for a podcast, ordered by `publishedAt` descending. Returns 404 if podcast not found.

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

Creates an on-demand FeedItem and dispatches the pipeline. Requires a podcast and duration tier. Optionally target a specific episode; if omitted, uses the latest episode.

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

---

### Feed (`/api/feed`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feed` | Paginated list of user's feed items |
| GET | `/api/feed/counts` | Feed item counts (total, unlistened, pending) |
| GET | `/api/feed/:id` | Feed item detail with briefing + clip |
| PATCH | `/api/feed/:id/listened` | Mark a feed item as listened |

**`GET /api/feed`**

Query params: `limit` (default 50), `offset` (default 0)

Response:
```json
{
  "feedItems": [
    {
      "id": "string",
      "source": "SUBSCRIPTION | ON_DEMAND",
      "status": "PENDING | PROCESSING | READY | FAILED",
      "durationTier": 5,
      "listened": false,
      "createdAt": "string",
      "podcast": { "id": "string", "title": "string", "imageUrl": "string" },
      "episode": { "id": "string", "title": "string", "publishedAt": "string" },
      "briefing": {
        "id": "string",
        "clip": { "audioUrl": "string", "actualSeconds": 300 },
        "adAudioUrl": null
      }
    }
  ]
}
```

**`GET /api/feed/counts`**

Response:
```json
{ "total": 10, "unlistened": 3, "pending": 1 }
```

**`GET /api/feed/:id`**

Returns a single feed item with full clip detail. Returns 404 if not found or not owned by user.

**`PATCH /api/feed/:id/listened`**

Marks the feed item as listened. Returns the updated feed item.

---

### Billing (`/api/billing`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/checkout` | Create Stripe Checkout session |
| POST | `/api/billing/portal` | Create Stripe Customer Portal session |

**`POST /api/billing/checkout`**

Body: `{ "tier": "PRO" | "PRO_PLUS" }`

Response: `{ "url": "https://checkout.stripe.com/..." }`

Returns 400 if plan is invalid or unavailable.

**`POST /api/billing/portal`**

No body required.

Response: `{ "url": "https://billing.stripe.com/..." }`

Returns 400 if user has never subscribed (no `stripeCustomerId`).

---

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
- `checkout.session.completed` -- Upgrades user tier based on Stripe price
- `customer.subscription.deleted` -- Reverts user to FREE tier

Response: `{ "received": true }`

---

## Admin Routes (`/api/admin`)

All admin routes require Clerk auth + `User.isAdmin = true`. Returns 401 if unauthenticated, 403 if not admin.

Every admin route group includes a `GET /health` endpoint returning `{ "status": "ok" }`.

---

### Dashboard (`/api/admin/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/` | System health overview |
| GET | `/stats` | Aggregate stat cards with 7-day trends |
| GET | `/activity` | Recent pipeline activity (20 most recent jobs) |
| GET | `/costs` | Today's cost summary by stage |
| GET | `/issues` | Active issues (failed jobs + broken feeds, last 48h) |
| GET | `/feed-refresh-summary` | Feed refresh status |

**`GET /api/admin/dashboard`**

Response:
```json
{
  "data": {
    "overall": "operational | degraded | critical",
    "stages": [...],
    "activeIssuesCount": 0
  }
}
```

**`GET /api/admin/dashboard/stats`**

Response:
```json
{
  "data": {
    "podcasts": { "total": 0, "trend": 0 },
    "users": { "total": 0, "trend": 0 },
    "episodes": { "total": 0, "trend": 0 },
    "feedItems": { "total": 0, "trend": 0 }
  }
}
```

**`GET /api/admin/dashboard/activity`**

Response:
```json
{
  "data": [
    {
      "id": "string",
      "timestamp": "string",
      "stage": 1,
      "stageName": "string",
      "episodeTitle": "string",
      "podcastName": "string",
      "status": "string",
      "type": "string"
    }
  ]
}
```

**`GET /api/admin/dashboard/costs`**

Response:
```json
{
  "data": {
    "todaySpend": 0,
    "yesterdaySpend": 0,
    "trend": 0,
    "breakdown": [{ "category": "string", "amount": 0, "percentage": 0 }],
    "budgetUsed": 0
  }
}
```

**`GET /api/admin/dashboard/issues`**

Response:
```json
{
  "data": [
    {
      "id": "string",
      "severity": "string",
      "title": "string",
      "description": "string",
      "rawError": "string",
      "entityId": "string",
      "entityType": "string",
      "createdAt": "string",
      "actionable": true
    }
  ]
}
```

**`GET /api/admin/dashboard/feed-refresh-summary`**

Response:
```json
{
  "data": {
    "lastRunAt": "string",
    "podcastsRefreshed": 0,
    "totalPodcasts": 0,
    "recentEpisodes": 0,
    "feedErrors": 0
  }
}
```

---

### Pipeline (`/api/admin/pipeline`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/jobs` | Paginated job list with filters |
| GET | `/jobs/:id` | Job detail with steps and request context |
| POST | `/jobs/:id/retry` | Retry a single failed job |
| POST | `/jobs/bulk/retry` | Bulk retry failed jobs |
| POST | `/trigger/feed-refresh` | Trigger manual feed refresh |
| POST | `/trigger/stage/:stage` | Trigger a specific stage |
| POST | `/trigger/episode/:id` | Trigger pipeline for episode |
| GET | `/stages` | Per-stage aggregate stats |

**`GET /api/admin/pipeline/jobs`**

Query params: `page`, `pageSize`, `currentStage`, `status`, `requestId`, `search`

Response:
```json
{
  "data": [...],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/pipeline/jobs/:id`**

Response:
```json
{
  "data": {
    "...job",
    "steps": [...],
    "requestContext": {...},
    "queuePosition": 0
  }
}
```

**`POST /api/admin/pipeline/jobs/:id/retry`**

Response:
```json
{ "data": { "id": "string", "status": "PENDING", "currentStage": 1 } }
```

**`POST /api/admin/pipeline/jobs/bulk/retry`**

Body: `{ "ids": ["string"] }`

Response: `{ "data": { "retriedCount": 0 } }`

**`POST /api/admin/pipeline/trigger/feed-refresh`**

Body: `{ "podcastId": "string (optional)" }`

Response: `{ "data": { "enqueued": 0, "skipped": 0, "message": "string" } }`

**`POST /api/admin/pipeline/trigger/stage/:stage`**

Trigger a specific stage for eligible episodes.

Response: `{ "data": { "enqueued": 0, "skipped": 0, "message": "string" } }`

**`POST /api/admin/pipeline/trigger/episode/:id`**

Body: `{ "stage": 1 }` (optional)

Response: `{ "data": { "enqueued": 0, "skipped": 0, "message": "string" } }`

**`GET /api/admin/pipeline/stages`**

Response:
```json
{
  "data": [
    {
      "stage": 1,
      "name": "string",
      "icon": "string",
      "activeJobs": 0,
      "successRate": 0,
      "avgProcessingTime": 0,
      "todayCost": 0,
      "perUnitCost": 0
    }
  ]
}
```

---

### Podcasts (`/api/admin/podcasts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/stats` | Catalog statistics |
| GET | `/` | Paginated podcast list |
| GET | `/:id` | Podcast detail with episodes and pipeline activity |
| POST | `/` | Create podcast |
| PATCH | `/:id` | Update podcast |
| DELETE | `/:id` | Archive podcast (soft delete) |
| POST | `/:id/refresh` | Trigger feed refresh for podcast |

**`GET /api/admin/podcasts/stats`**

Response:
```json
{
  "data": {
    "total": 0,
    "byHealth": {...},
    "byStatus": {...},
    "needsAttention": 0
  }
}
```

**`GET /api/admin/podcasts`**

Query params: `page`, `pageSize`, `search`, `health`, `status`, `sort`

Response:
```json
{
  "data": [...],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/podcasts/:id`**

Response:
```json
{
  "data": {
    "...podcast",
    "episodes": [
      {
        "id": "string",
        "title": "string",
        "audioUrl": "string | null",
        "publishedAt": "ISO string",
        "durationSeconds": "number | null",
        "transcriptUrl": "string | null",
        "pipelineStatus": "pending | transcribing | distilling | generating_clips | completed | failed",
        "clipCount": 0,
        "totalCost": "number | null",
        "clips": [
          {
            "id": "string",
            "durationTier": 5,
            "actualSeconds": 295,
            "status": "COMPLETED",
            "audioUrl": "string | null",
            "feedItems": [
              {
                "id": "string",
                "userId": "string",
                "source": "SUBSCRIPTION | ON_DEMAND",
                "status": "string",
                "requestId": "string | null",
                "createdAt": "ISO string"
              }
            ]
          }
        ]
      }
    ],
    "recentPipelineActivity": [...]
  }
}
```

**`POST /api/admin/podcasts`**

Body:
```json
{
  "feedUrl": "string (required)",
  "title": "string (required)",
  "description": "string",
  "imageUrl": "string",
  "author": "string"
}
```

Response (201): `{ "data": {...podcast} }`

**`PATCH /api/admin/podcasts/:id`**

Body (all fields optional):
```json
{
  "status": "string",
  "feedHealth": "string",
  "feedError": "string",
  "title": "string",
  "description": "string"
}
```

Response: `{ "data": {...podcast} }`

**`DELETE /api/admin/podcasts/:id`**

Archives the podcast (soft delete).

Response: `{ "data": { "id": "string", "status": "archived" } }`

**`POST /api/admin/podcasts/:id/refresh`**

Enqueue feed refresh for a specific podcast.

Response (201): `{ "data": { "podcastId": "string", "status": "dispatched" } }`

---

### Episodes (`/api/admin/episodes`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/` | Paginated episode list |
| GET | `/:id` | Episode detail with pipeline trace |
| POST | `/:id/reprocess` | Trigger reprocessing |

**`GET /api/admin/episodes`**

Query params: `page`, `pageSize`, `podcastId`, `search`, `sort`

Response:
```json
{
  "data": [...],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/episodes/:id`**

Response:
```json
{
  "data": {
    "...episode",
    "distillation": {...},
    "clips": [...],
    "feedItemAppearances": [...],
    "pipelineTrace": [...]
  }
}
```

**`POST /api/admin/episodes/:id/reprocess`**

Dispatches episode to the transcription queue.

Response (201): `{ "data": { "episodeId": "string", "status": "dispatched" } }`

---

### Briefings (`/api/admin/briefings`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/` | Paginated briefing list (per-user Clip wrappers) |
| GET | `/:id` | Briefing detail with clip, episode, and feed items |

**`GET /api/admin/briefings`**

Query params: `page`, `pageSize`, `userId`, `sort`

Response:
```json
{
  "data": [
    {
      "id": "string",
      "userId": "string",
      "userEmail": "string",
      "clipId": "string",
      "durationTier": 5,
      "clipStatus": "COMPLETED",
      "actualSeconds": 300,
      "audioUrl": "string",
      "adAudioUrl": null,
      "episodeTitle": "string",
      "podcastTitle": "string",
      "feedItemCount": 1,
      "createdAt": "string"
    }
  ],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/briefings/:id`**

Response:
```json
{
  "data": {
    "id": "string",
    "userId": "string",
    "clipId": "string",
    "adAudioUrl": null,
    "clip": {
      "id": "string",
      "durationTier": 5,
      "status": "COMPLETED",
      "actualSeconds": 300,
      "audioUrl": "string",
      "episodeTitle": "string",
      "podcastTitle": "string"
    },
    "feedItems": [
      { "id": "string", "status": "READY", "listened": false, "source": "SUBSCRIPTION" }
    ]
  }
}
```

---

### Users (`/api/admin/users`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/segments` | User segment counts |
| GET | `/` | Paginated user list |
| GET | `/:id` | User detail with subscriptions |
| PATCH | `/:id` | Update user (tier, admin toggle) |

**`GET /api/admin/users/segments`**

Response:
```json
{
  "data": {
    "all": 0,
    "power_users": 0,
    "at_risk": 0,
    "trial_ending": 0,
    "recently_cancelled": 0,
    "never_active": 0
  }
}
```

**`GET /api/admin/users`**

Query params: `page`, `pageSize`, `tier`, `search`, `segment`, `sort`

Response:
```json
{
  "data": [...],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/users/:id`**

Response:
```json
{
  "data": {
    "...user",
    "subscriptions": [...],
    "recentFeedItems": [...]
  }
}
```

**`PATCH /api/admin/users/:id`**

Body (all fields optional):
```json
{
  "tier": "FREE | PRO | PRO_PLUS",
  "isAdmin": true
}
```

Response: `{ "data": { "id": "string", "tier": "string", "isAdmin": true } }`

---

### Analytics (`/api/admin/analytics`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/costs` | Cost analytics by stage and period |
| GET | `/costs/by-model` | Cost breakdown by AI model and stage |
| GET | `/usage` | Usage trends and distribution |
| GET | `/quality` | Quality metrics and trends |
| GET | `/pipeline` | Pipeline throughput and bottlenecks |

All analytics endpoints accept `from` and `to` query params (ISO date strings).

**`GET /api/admin/analytics/costs`**

Response:
```json
{
  "data": {
    "totalCost": 0,
    "comparison": {...},
    "dailyCosts": [...],
    "metrics": {...},
    "efficiencyScore": 0
  }
}
```

**`GET /api/admin/analytics/costs/by-model`**

Query params: `from`, `to` (ISO date strings)

Response:
```json
{
  "data": {
    "models": [
      { "model": "claude-sonnet-4-20250514", "calls": 10, "inputTokens": 5000, "outputTokens": 2000, "cost": 0 }
    ],
    "byStage": [
      { "stage": "DISTILLATION", "model": "claude-sonnet-4-20250514", "calls": 5, "inputTokens": 3000, "outputTokens": 1500, "cost": 0 }
    ]
  }
}
```

**`GET /api/admin/analytics/usage`**

Response:
```json
{
  "data": {
    "metrics": {...},
    "trends": [...],
    "byTier": {...},
    "peakTimes": [...],
    "topPodcasts": [...]
  }
}
```

**`GET /api/admin/analytics/quality`**

Response:
```json
{
  "data": {
    "overallScore": 0,
    "components": {
      "timeFitting": 0,
      "claimCoverage": 0,
      "transcription": 0,
      "userSatisfaction": 0
    },
    "trend": [...],
    "recentIssues": [...]
  }
}
```

**`GET /api/admin/analytics/pipeline`**

Response:
```json
{
  "data": {
    "throughput": {...},
    "successRates": {...},
    "processingSpeed": {...},
    "bottlenecks": [...]
  }
}
```

---

### Configuration (`/api/admin/config`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/` | All runtime config values grouped by prefix |
| PATCH | `/:key` | Update a config value |
| GET | `/tiers/duration` | Duration tier config |
| PUT | `/tiers/duration` | Update duration tiers |
| GET | `/tiers/subscription` | Subscription plans with user counts |
| PUT | `/tiers/subscription` | Update a subscription plan |
| GET | `/features` | Feature flags |
| PUT | `/features/:id` | Update a feature flag |

**`GET /api/admin/config`**

Response:
```json
{
  "data": [
    {
      "category": "pipeline",
      "entries": [
        { "id": "string", "key": "pipeline.enabled", "value": "true", "description": "string" }
      ]
    }
  ]
}
```

**`PATCH /api/admin/config/:key`**

Body:
```json
{
  "value": "string (required)",
  "description": "string"
}
```

Response: `{ "data": { "id": "string", "key": "string", "value": "string" } }`

**`GET /api/admin/config/tiers/duration`**

Response:
```json
{
  "data": [
    {
      "minutes": 5,
      "cacheHitRate": 0,
      "clipsGenerated": 0,
      "storageCost": 0,
      "usageFrequency": 0
    }
  ]
}
```

**`PUT /api/admin/config/tiers/duration`**

Body: `{ "tiers": [...] }`

Response: `{ "data": { "success": true } }`

**`GET /api/admin/config/tiers/subscription`**

Response:
```json
{
  "data": [
    {
      "tier": "FREE",
      "name": "string",
      "priceCents": 0,
      "active": true,
      "userCount": 0,
      "features": ["string"],
      "highlighted": false,
      "stripePriceId": "string"
    }
  ]
}
```

**`PUT /api/admin/config/tiers/subscription`**

Body:
```json
{
  "tier": "FREE | PRO | PRO_PLUS (required)",
  "name": "string",
  "priceCents": 0,
  "active": true,
  "features": ["string"],
  "highlighted": false,
  "sortOrder": 0
}
```

Response: `{ "data": {...plan} }`

**`GET /api/admin/config/features`**

Response:
```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "enabled": true,
      "rolloutPercentage": 100,
      "tierAvailability": ["FREE", "PRO"],
      "description": "string"
    }
  ]
}
```

**`PUT /api/admin/config/features/:id`**

Body (all fields optional):
```json
{
  "enabled": true,
  "rolloutPercentage": 100,
  "tierAvailability": ["FREE", "PRO", "PRO_PLUS"],
  "description": "string"
}
```

Response: `{ "data": {...feature} }`

---

### Requests (`/api/admin/requests`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated request list with status filter |
| GET | `/:id` | Request detail with job/step progress tree |
| GET | `/work-product/:id/preview` | Preview work product content |
| GET | `/work-product/:id/audio` | Stream work product audio |
| POST | `/test-briefing` | Create admin test briefing request |

**`GET /api/admin/requests`**

Query params: `page`, `pageSize`, `status`

Response:
```json
{
  "data": [...],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

**`GET /api/admin/requests/:id`**

Response:
```json
{
  "data": {
    "...request",
    "jobProgress": [
      {
        "jobId": "string",
        "steps": [
          {
            "stage": 1,
            "workProducts": {...}
          }
        ]
      }
    ]
  }
}
```

**`GET /api/admin/requests/work-product/:id/preview`**

Returns work product content from R2. Text content returned up to 50KB; audio returns metadata only.

Response:
```json
{
  "data": {
    "id": "string",
    "type": "string",
    "r2Key": "string",
    "contentType": "string",
    "content": "string",
    "truncated": false
  }
}
```

**`GET /api/admin/requests/work-product/:id/audio`**

Streams audio work product from R2.

Response: `audio/mpeg` stream

**`POST /api/admin/requests/test-briefing`**

Create an admin test briefing request.

Body:
```json
{
  "items": [
    {
      "podcastId": "string",
      "episodeId": "string",
      "useLatest": false
    }
  ],
  "targetMinutes": 5
}
```

Response (201): `{ "data": {...request} }`
