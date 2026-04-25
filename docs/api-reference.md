# Blipp API Reference

All routes are served by the Blipp Hono v4 app running on Cloudflare Workers. The API is mounted at `/api` by `worker/index.ts`; admin routes are mounted at `/api/admin`; public pages live at `/p/*` (server-rendered for SEO). This page lists every route exposed by the worker and summarises auth, plan gating, and notable behaviour. Refer to the TypeScript handlers in `worker/routes/` for exact request/response shapes.

## Conventions

- All routes return JSON unless noted.
- Errors follow `{ error: string; code?: string; requestId?: string; details?: unknown }`. `requestId` is always echoed from the `x-request-id` header.
- Paginated endpoints accept `?page=`, `?pageSize=` (+ `?sort=`, `?search=`, `?status=` where applicable) and return `{ data: [...], total, page, pageSize }`.
- Webhook endpoints (`/api/webhooks/*`) bypass Clerk + API-key auth and verify provider signatures instead.
- `Bearer ${CLERK_SECRET_KEY}` and `Bearer blp_live_*` (API key) both bypass Clerk session auth. API keys are resolved to a user + scope list in `worker/middleware/api-key.ts`.

## Authentication Matrix

| Pattern | Auth |
|---------|------|
| `GET /api/health`, `GET /api/health/deep`, `GET /api/assets/*` | None |
| `POST /api/support` | None (public contact form) |
| `POST /api/webhooks/clerk` · `/stripe` · `/revenuecat` | Webhook signature |
| `POST /api/auth/native` | None — verifies ID tokens server-side |
| `GET /__clerk/*`, `GET /api/__clerk/*` | Clerk FAPI proxy (no app auth) |
| `GET /p/*`, `GET /sitemap.xml`, `GET /robots.txt` | None (public SEO) |
| `/api/me/*`, `/api/podcasts/*`, `/api/briefings/*`, `/api/feed/*`, `/api/clips/*`, `/api/blipps/*`, `/api/billing/*`, `/api/iap/*`, `/api/plans/*`, `/api/recommendations/*`, `/api/voice-presets/*`, `/api/feedback/*`, `/api/events/*` | Clerk session **or** `Bearer CLERK_SECRET_KEY` **or** `Bearer blp_live_*` API key |
| `/api/admin/*` | Clerk session + `User.isAdmin` |
| `/api/internal/clean/*` | Admin-guarded internal cleanup |

Plan limits are enforced inside handlers via `worker/lib/plan-limits.ts`:

- `checkDurationLimit` · `checkSubscriptionLimit` · `checkWeeklyBriefingLimit` · `checkPastEpisodesLimit` · `checkConcurrentJobLimit`.

## Proxy / Auth Bootstrap

| Method | Path | Purpose |
|--------|------|---------|
| ALL | `/__clerk/*` (`worker/routes/clerk-auth-proxy.ts`) | Web FAPI proxy. Clerk SDK in the browser talks to same-origin `/__clerk/*` so native-platform cookies work without third-party domain issues. |
| ALL | `/api/__clerk/*` (`worker/routes/clerk-proxy.ts`) | Capacitor FAPI proxy. Accepts `capacitor://` origins; rewrites `Set-Cookie` to survive WKWebView. Runs *before* `/api` middleware. |
| POST | `/api/auth/native` (`worker/routes/native-auth.ts`) | Verifies Google/Apple ID tokens server-side and returns a Clerk sign-in ticket. Used by the native app's custom sign-in screen. |

## Public Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Returns `{ status: "ok", timestamp }` without touching the DB. |
| GET | `/api/health/deep` | Probes DB, R2, and queue bindings. Returns 200 if healthy, 503 if degraded. Cached 30 s. |
| GET | `/api/plans` | Active plans sorted by `sortOrder`. |
| GET | `/api/assets/jingles/intro.mp3` · `/outro.mp3` | Whitelist-only static audio for client-side jingle playback (long-lived cache). |
| POST | `/api/support` | Submit a public support message (`SupportMessage`). No auth. |
| GET | `/p/:showSlug` · `/p/:showSlug/:episodeSlug` · `/p/category/:categorySlug` | Server-rendered HTML for the SEO Blipp pages. |
| GET | `/sitemap.xml`, `/robots.txt` | Dynamic, regenerated on each request. |

### Webhooks

| Method | Path | Provider | Verification |
|--------|------|----------|--------------|
| POST | `/api/webhooks/clerk` | Clerk | `@clerk/backend` + `CLERK_WEBHOOK_SECRET`. Handles `user.created/updated/deleted`, enqueues `WELCOME_EMAIL_QUEUE` on create. |
| POST | `/api/webhooks/stripe` | Stripe | `stripe.webhooks.constructEventAsync` + `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Writes `BillingEvent`, upserts `BillingSubscription`, triggers `recomputeEntitlement`. |
| POST | `/api/webhooks/revenuecat` | RevenueCat (Apple IAP) | Authorization Bearer (`REVENUECAT_WEBHOOK_SECRET`). Handles `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `REFUND`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `EXPIRATION`, `TRANSFER` + status-only events. Sandbox events are filtered in production. |

## User (`/api/me`)

All `/me` routes require authentication.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me` | Current user with plan, Stripe subscription status, feature-flag snapshot. Creates the DB user on first call if the Clerk ID is new. |
| PATCH | `/me/onboarding-complete` | Marks onboarding complete; triggers `deliverStarterPack` on the first completion. Accepts `{ reset?: true }`. |
| GET | `/me/usage` | Usage metering: briefings this week, active subscriptions, past-episode limit consumption, sharing + transcript access flags. |
| PATCH | `/me/preferences` | Update `defaultDurationTier`, `defaultVoicePresetId`, `acceptAnyVoice`, `preferred/excludedCategories`, `preferred/excludedTopics`, `zipCode`. Recomputes `UserRecommendationProfile` + `RecommendationCache`. Validates voice preset against `Plan.allowedVoicePresetIds`. |
| GET | `/me/export` | GDPR Article 20 export — streams a JSON dump of the user's records. |
| DELETE | `/me` | GDPR Article 17 account deletion. Body: `{ confirm: "DELETE" }`. |
| POST | `/me/push/subscribe` | Register a Web Push subscription (`endpoint`, `keys.p256dh`, `keys.auth`). |
| DELETE | `/me/push/subscribe` | Unregister a Web Push subscription by endpoint. |
| GET | `/me/push/vapid-key` | Return the VAPID public key for subscription setup. |
| GET | `/me/sports-teams` | Browse `SportsTeam` with user's `UserSportsTeam` selections. Accepts `?q=`. |
| PUT | `/me/sports-teams` | Replace selections (max 50). Recomputes recommendations. |

## Plans & Billing

| Method | Path | Purpose | Rate limit |
|--------|------|---------|------------|
| GET | `/api/plans` | Public plan listing. | — |
| GET | `/api/plans/current` | The authenticated user's current plan (via `User.planId`). | — |
| POST | `/api/plans/:planId/checkout` | Create Stripe Checkout session. Body includes `interval` (`monthly/annual`). Returns `{ url }`. | — |
| GET | `/api/billing/subscription` | User's active `BillingSubscription` (Stripe + Apple). | — |
| GET | `/api/billing/portal-session` | Stripe Customer Portal redirect. | — |
| GET | `/api/iap/billing-status` | Summary of active billing sources for the IAP UX decision. Returns `{ activeSources, canPurchaseIAP, subscriptionSource, manageUrl, rows }`. | — |
| POST | `/api/iap/link` | After a StoreKit purchase lands, upsert `BillingSubscription(source: APPLE)` via RevenueCat REST v2 confirmation, then `recomputeEntitlement`. Body: `{ productId, originalTransactionId }`. | — |
| POST | `/api/iap/restore` | Recompute entitlement after `Purchases.restorePurchases()`. | — |

## Podcasts (`/api/podcasts`)

| Method | Path | Purpose | Plan gate |
|--------|------|---------|-----------|
| GET | `/podcasts/catalog` | Browse/search local catalog. Query: `?q=`, `?category=`, `?page=`, `?pageSize=`, `?sort=rank/popularity/subscriptions/favorites`, `?explicit=`. Cached response (5 min + 1 min SWR). | — |
| GET | `/podcasts/detail/:podcastId` (alias `/podcasts/:podcastId`) | Podcast detail + subscription status. | — |
| GET | `/podcasts/:podcastId/episodes` | Paginated episode list. | — |
| POST | `/podcasts/subscribe` | Subscribe. Body: `{ feedUrl, title, durationTier, voicePresetId?, description?, imageUrl?, podcastIndexId?, author? }`. Rate-limit 5/min. | `checkSubscriptionLimit`, `checkDurationLimit`, voice preset gate |
| PATCH | `/podcasts/:podcastId` | Update subscription (`durationTier`, `voicePresetId`). | `checkDurationLimit`, voice preset gate |
| DELETE | `/podcasts/:podcastId` | Unsubscribe. | — |
| POST | `/podcasts/request` | Submit a `PodcastRequest`. Body: `{ feedUrl, title? }`. Enforces `catalog.requests.maxPerUser`. | — |
| POST | `/podcasts/:podcastId/vote` | Upsert `PodcastVote`. Body: `{ vote: 1 | -1 | 0 }` (0 = remove). | — |
| GET | `/podcasts/favorites` | List user favorites. | — |
| PUT | `/podcasts/favorites` | Replace favorites. Body: `{ podcastIds: string[] }`. | — |

## Briefings (`/api/briefings`)

| Method | Path | Purpose | Plan gate | Rate limit |
|--------|------|---------|-----------|------------|
| POST | `/briefings/generate` | Create on-demand briefing. Body: `{ podcastId, episodeId?, durationTier, voicePresetId? }`. Creates a `BriefingRequest(source: ON_DEMAND)`. Rejects when the podcast is flagged music. | `checkWeeklyBriefingLimit`, `checkDurationLimit`, `checkPastEpisodesLimit`, `checkConcurrentJobLimit`, voice preset gate | 10/hr |

## Feed (`/api/feed`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/feed` | Paginated feed. Query: `?status=`, `?source=`, `?listened=`, `?page=`, `?pageSize=`. |
| GET | `/feed/counts` | Counts by status for badges. |
| GET | `/feed/:id` | Feed item detail (includes the linked `Briefing` + `Clip`). |
| PATCH | `/feed/:id/listened` | Mark listened. Body: `{ listened: boolean, positionSeconds? }`. |
| DELETE | `/feed/:feedItemId` | Soft-delete a feed item. |

## Clips (`/api/clips`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/clips/:episodeId/:durationTier` | Stream the clip audio from R2 (Range-aware). |
| GET | `/clips/:id` | Clip record (narrative + audio URL + metadata). |

## Blipps Availability (`/api/blipps`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/blipps/availability` | Given `?episodeId=&durationTier=`, returns `{ matchType: "exact" | "any_voice" | "unavailable", estimatedWaitSeconds }`. |

## Voice Presets (`/api/voice-presets`)

| Method | Path | Purpose | Rate limit |
|--------|------|---------|------------|
| GET | `/voice-presets` | List voice presets available to the user's plan (system presets always included). | — |
| POST | `/voice-presets/:id/preview` | Generate a short TTS preview; cached in R2 by hash of voice settings + text. | 20/min |

## Recommendations (`/api/recommendations`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/recommendations` | Personalised recommendations based on `UserRecommendationProfile` + geo + sports. |
| GET | `/recommendations/curated` | Editor's picks / trending. |
| GET | `/recommendations/local` | Local (city/state) recommendations — honours `User.zipCode` / Cloudflare `cf.region`. |

## Feedback & Support (`/api/feedback`, `/api/support`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/feedback` | General feedback (`Feedback` record). |
| POST | `/feedback/blipp` | Per-blipp feedback with structured reasons (`blipp_failed`, `missed_key_points`, `inaccurate`, `too_short`, `too_long`, `poor_audio`, `not_interesting`) and optional message. Sets `isTechnicalFailure` when reason is `blipp_failed`. |
| POST | `/support` | Public contact form — no auth. |

## Events (`/api/events`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/events/listen-original` | Log a `ListenOriginalEvent` (click / start / complete). Body includes `sessionId`, `deviceType`, `platform`, `blippId`, `episodeId`, `podcastId`, `publisherId`, `referralSource`, `blippDurationMs`, `timeToClickSec`, `blippCompletionPct`, `utm{Source,Medium,Campaign}`. |
| PATCH | `/events/listen-original/:eventId/return` | Mark that the user returned to Blipp after the original — closes the attribution loop. |

---

## Admin API (`/api/admin`)

All admin routes require Clerk auth + `User.isAdmin`. Every non-GET response with a 2xx status writes an `AuditLog` entry (see middleware in `worker/routes/admin/index.ts`). Page counterparts live under `src/pages/admin/*` (see [admin-platform.md](./admin-platform.md)).

### Dashboard (`/admin/dashboard`)

Used by `/admin/command-center`.

- `GET /` · `/health` · `/stats` · `/activity` · `/costs` · `/issues` · `/feed-refresh-summary`.

### Pipeline (`/admin/pipeline`)

- `GET /jobs` — paginated jobs (filters: stage, status, requestId, search).
- `GET /jobs/:id` — job + steps + events + work products.
- `POST /jobs/:id/retry` / `POST /jobs/:id/dismiss` · `POST /jobs/bulk/retry` · `POST /jobs/bulk/dismiss`.
- `POST /trigger/feed-refresh` · `POST /trigger/stage/:stage` · `POST /trigger/episode/:id` · `GET /stages` · `GET /triggers`.

### Requests (`/admin/requests`)

- `GET /` · `GET /:id` — `BriefingRequest` browser with job → step → event tree.
- `GET /work-product/:id/preview` / `/audio` — inline viewers for text/JSON/audio work products.
- `POST /test-briefing` — admin test request (creates `BriefingRequest(mode: USER, isTest: true)` with supplied episode).

### Catalog

- **`/admin/podcasts`** — `GET /stats`, `GET /` (paginated), `GET /:id`, `POST /` (create), `PATCH /:id`, `DELETE /:id` (archive), `POST /:id/refresh`, `POST /:id/evict`.
- **`/admin/episodes`** — `GET /` (paginated), `GET /:id`, `PATCH /:id`, `POST /:id/reprocess`, `POST /:id/enqueue`.
- **`/admin/catalog-seed`** — catalog discovery jobs (Apple top-200 / Podcast Index trending): `POST /`, `GET /`, `GET /:id`, `POST /:id/cancel`, `POST /:id/archive`, `POST /archive-bulk`, `DELETE /:id`.
- **`/admin/catalog-pregen`** — `POST /`, `GET /status`.
- **`/admin/episode-refresh`** — `GET /`, `GET /:id`, `GET /:id/errors`, `POST /`, `POST /:id/pause|resume|cancel|archive`, `POST /archive-bulk`, `DELETE /:id`.
- **`/admin/geo-tagging`** — `POST /`, `GET /status`.
- **`/admin/publisher-reports`** — `GET /`, `POST /generate`.

### Briefings (`/admin/briefings`)

- `GET /` — paginated briefing listing with filters.
- `GET /:id` — briefing detail + linked feed items.

### Users & Plans

- **`/admin/users`** — `GET /`, `GET /segments`, `GET /:id`, `PATCH /:id`, `POST /:id/mark-welcomed`, `DELETE /:id`, `GET /:id/export`.
- **`/admin/plans`** — `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` (soft delete; prevents deletion when users still reference the plan).
- **`/admin/recommendations`** — `GET /`, `GET /:userId`, `POST /recompute/:userId`.

### AI / Models

- **`/admin/config`** — `GET /`, `PATCH /:key`, `GET /tiers/duration`, `PUT /tiers/duration`, `GET /tiers/subscription`, `PUT /tiers/subscription`, `GET /features`, `PUT /features/:id`.
- **`/admin/ai-models`** — `GET /`, `POST /`, `PATCH /:id`, `POST /:id/providers`, `PATCH /:id/providers/:providerId`, `DELETE /:id/providers/:providerId`.
- **`/admin/ai-errors`** — `GET /` with filters (`?service=`, `?provider=`, `?category=`, `?correlationId=`, `?episodeId=`, `?resolved=`).
- **`/admin/prompts`** — `GET /`, `PATCH /:id` (versioned `PromptVersion`).
- **`/admin/stt-benchmark`** — experiment lifecycle: `POST /experiments`, `GET /experiments`, `GET /experiments/:id`, `POST /experiments/:id/run`, `POST /experiments/:id/cancel`, `GET /experiments/:id/results`, `DELETE /experiments/:id`, `GET /eligible-episodes`, `GET /episode-audio/:id`, `POST /upload-audio`, `GET /results/:id/transcript`, `GET /results/:id/reference-transcript`, `GET /episodes/:episodeId/reference-transcript`.
- **`/admin/claims-benchmark`** — analogous lifecycle for claims extraction benchmarks.
- **`/admin/voice-presets`** — CRUD over `VoicePreset`, including `POST /:id/preview` for admin auditioning.

### Analytics (`/admin/analytics`)

- `GET /costs` · `GET /costs/by-model` · `GET /usage` · `GET /quality` · `GET /pipeline` · `GET /retention` · `GET /events` · `GET /revenue`.

### Ops / Infra

- **`/admin/audit-log`** — `GET /` (paginated audit trail).
- **`/admin/api-keys`** — `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`. Scopes configured per key.
- **`/admin/cron-jobs`** — `GET /`, `GET /:jobKey`, `PATCH /:jobKey`, `POST /trigger/:jobId`, `GET /:jobKey/runs`, `GET /runs/:runId/logs`.
- **`/admin/worker-logs`** — `GET /`, `GET /stream` (proxies Cloudflare Observability using `CF_API_TOKEN` + `CF_ACCOUNT_ID`).
- **`/admin/storage`** — `GET /usage`, `DELETE /cleanup` (orphan scan).
- **`/admin/service-keys`** — `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/rotate`, `POST /:id/test`, `GET /contexts`.
- **`/admin/feedback`** — `GET /`, `GET /:id`, `DELETE /:id`.
- **`/admin/blipp-feedback`** — `GET /`, `DELETE /:id`.
- **`/admin/support`** — `GET /`, `GET /:id`, `PATCH /:id` (resolve), `DELETE /:id`.

### Internal Cleanup

- **`POST /api/internal/clean/r2`** — orphan sweep (admin-guarded; mounted at `/api/internal/clean`, not under `/admin`).

## Pagination, Sorting, and Search

Admin list endpoints accept:

- `?page=`, `?pageSize=` (defaulted in `parsePagination`).
- `?sort=` as a comma-separated field list with optional `-` prefix for descending (e.g. `-createdAt,name`). Parsed by `parseSort`.
- `?search=` for server-side substring search where supported.
- Standard response: `{ data: [...], total, page, pageSize }` via `paginatedResponse`.

## Error Codes

Errors surface a `code` when classification is available:

| Code | HTTP | Meaning |
|------|------|---------|
| `ROUTE_NOT_FOUND` | 404 | Unmatched route. |
| `UNAUTHENTICATED` | 401 | Clerk session / API key missing or invalid. |
| `FORBIDDEN` | 403 | Admin gate or plan feature denied. |
| `VALIDATION_ERROR` | 400 | Body failed schema validation (Zod). |
| `PLAN_LIMIT_EXCEEDED` | 403 | One of the `plan-limits.ts` checks tripped. |
| `CONFLICT` | 409 | Unique constraint (e.g. duplicate subscription). |
| `RATE_LIMITED` | 429 | Rate-limit window exhausted. |
| `NOT_FOUND` | 404 | Entity missing. |
| `MUSIC_FEED_ITEM_ERROR` | 409 | Podcast invalidated as music. |
| `INTERNAL` | 500 | Unhandled error (also logged with stack). |

Errors unify through `classifyHttpError()` in `worker/lib/errors.ts`.
