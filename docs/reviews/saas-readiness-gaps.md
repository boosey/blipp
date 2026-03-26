# SaaS Readiness Gaps

**Reviewed:** 2026-03-26
**Reviewer:** docs-reviewer agent
**Scope:** Full codebase audit — `worker/`, `src/`, `prisma/schema.prisma`, `docs/`

---

## Executive Summary

Blipp has a solid technical foundation for a SaaS product: structured request logging, audit logs, Sentry error tracking, rate limiting, health checks, feature flags, a billing system, per-stage pipeline observability, and an admin dashboard. However, several dimensions remain under-built for production-scale SaaS operations. The most critical gaps are in **billing enforcement** (limits defined but not enforced at request time), **alerting** (no proactive notifications for degraded state), **multi-tenancy isolation** (shared clips across users), and **operational runbooks** (no documented incident response).

---

## 1. Governance

### What exists
- `AuditLog` model with before/after snapshots, `actorId`, `action`, `entityType`, `entityId`.
- `writeAuditLog` called in admin user management (`PATCH /admin/users/:id`), config updates, and plan changes.
- `AuditLog` queryable via `GET /admin/audit-log` with filters.

### Gaps

**1.1 Audit coverage is incomplete.**
Only three admin actions currently emit audit log entries: user plan change, user status change, and config updates. The following are unaudited:
- Voice preset creation/modification/deletion
- Prompt version creation (significant — affects all users' output)
- Admin-triggered pipeline jobs (manual retries, episode triggers)
- API key creation and revocation
- Plan creation/modification (plan CRUD routes have no `writeAuditLog` calls)
- Podcast archive/delete via admin

**1.2 No compliance features for GDPR/CCPA.**
There is a `PENDING` delete-request mechanism (`PodcastRequest` tracks user-submitted podcast requests, but no GDPR "right to erasure" request model exists). The `User` model has `onDelete: Cascade` on most relations, which handles hard deletion, but:
- No formal data deletion request flow exists (no endpoint, no approval workflow).
- No export-my-data endpoint (GDPR Article 20).
- No consent record model for GDPR opt-ins beyond the cookie consent UI component (`src/components/cookie-consent.tsx`).

**1.3 Audit log has no retention policy.**
`AuditLog` has no TTL or archival mechanism. As the product scales, this table will grow unbounded. The data retention job (`worker/lib/cron/data-retention.ts`) does not include audit log archival.

**1.4 Admin privilege escalation is unaudited.**
`isAdmin` changes are blocked via `PATCH /admin/users/:id` with a console warning, but there is no audit trail for when isAdmin is set directly via the database or seeding scripts.

---

## 2. Administration

### What exists
- Full admin dashboard with command center, pipeline browser, user management, catalog, analytics, briefings view.
- User segments, status management (active/suspended/banned), plan management.
- `requireAdmin` middleware enforcing `User.isAdmin`.
- API key system with scopes, expiry, and soft revocation.
- Deep health check at `GET /api/health/deep` covering DB, R2, and queue bindings.

### Gaps

**2.1 No self-service admin role delegation.**
Granting admin is only possible via direct database manipulation or seed scripts. There is no super-admin concept or UI to promote/demote admins safely with an audit trail.

**2.2 User suspension does not block API access.**
`User.status` has `"suspended"` and `"banned"` values, but there is no middleware that checks this field before allowing API access. A suspended user with a valid Clerk session can continue making requests. The status field is set but never read during auth.

**2.3 No bulk operations for user management.**
Admin user list has no bulk action support (bulk suspend, bulk plan change, bulk export). At scale, managing users one-by-one becomes impractical.

**2.4 Health check omits AI providers.**
`deepHealthCheck` checks DB, R2, and queue bindings. It does not check reachability of external AI providers (Anthropic, OpenAI, Deepgram, etc.), which are the primary failure surface in the pipeline.

---

## 3. Performance

### What exists
- Cloudflare Hyperdrive for PostgreSQL connection pooling.
- `PlatformConfig` 60-second in-memory TTL cache (`worker/lib/config.ts`).
- Cloudflare Cache API used for `/api/podcasts/catalog` (5 min TTL) and `/api/health/deep` (30s TTL).
- `cacheResponse` middleware exists but is applied to only two endpoints.
- Workers AI + multi-provider AI with provider fallback.

### Gaps

**3.1 Feed endpoint not cached.**
`GET /api/feed` is user-specific and high-frequency but has no caching layer. Each request hits Postgres. At scale, this is a significant query load.

**3.2 Analytics queries load all rows into memory.**
`analyticsRoutes.get("/usage")` fetches all `feedItems`, `episodes`, and `users` within a date range into memory, then filters by day in JavaScript. For a 30-day window at scale, this will OOM the worker or exhaust Postgres memory. These should use `GROUP BY date_trunc` SQL queries.

**3.3 User segments query fetches all users.**
`GET /admin/users/segments` loads all users with their feed item counts into memory (`prisma.user.findMany` with no limit), then counts in JavaScript. This will not scale past a few thousand users.

**3.4 No CDN caching for audio assets.**
Briefing audio clips are served from R2 via signed URLs or direct public access. There is no documented CDN strategy for caching audio at the edge. R2 has no built-in CDN — Cloudflare's free tier applies, but no explicit Cache-Control headers are set on R2 object creation.

**3.5 Cold start overhead.**
Worker cold starts re-instantiate Sentry, build the Hono router, and run all module-level imports. The `prismaMiddleware` creates a new `PrismaClient` per request (by design), but the worker module graph is large. No bundle size tracking or cold start measurement exists.

**3.6 No query performance monitoring.**
No slow query detection, no Postgres `pg_stat_statements` integration, no query timing in structured logs.

---

## 4. Reliability

### What exists
- Queue retry configuration (3 retries per stage).
- `checkStageEnabled()` gate in each queue handler.
- `AiServiceError` model for tracking external AI failures.
- Sentry integration (`@sentry/cloudflare`) with 10% trace sample rate.
- `voiceDegraded` flag on `Clip` when non-primary TTS provider is used.
- Pipeline partial completion: briefings are created from successful jobs even if some fail.

### Gaps

**4.1 No circuit breakers for AI providers.**
When an AI provider returns repeated errors (rate limits, timeouts), the system retries the same provider up to 3 times, then fails the job. There is no circuit breaker that would automatically route to an alternate provider after N consecutive failures, nor any backoff strategy beyond queue retries.

**4.2 No database backup verification.**
`NEON_API_KEY` / `NEON_PROJECT_ID` are listed as optional env bindings for "backup verification," but there is no implementation of backup verification in the codebase. Neon provides automated backups, but there is no tested restore procedure documented.

**4.3 No graceful degradation for non-critical features.**
If the recommendation engine fails (e.g., `UserRecommendationProfile` computation errors), the system does not fall back gracefully — the feature silently returns empty results with no user notification. Same for push notifications.

**4.4 No dead letter queue handling.**
Queue messages that fail all 3 retries are dropped. There is no dead letter queue or alerting when messages are exhausted. The `AiServiceError` model captures individual errors, but systematic queue exhaustion is not tracked.

**4.5 Scheduled job failures are not surfaced.**
`CronRun` / `CronRunLog` models exist, but there is no alerting when a critical cron job fails (e.g., pipeline-trigger or data-retention). Admin would need to manually check the Cron Jobs admin page.

---

## 5. Observability

### What exists
- Structured JSON request logging in `requestLogger` middleware (method, path, status, duration, userId, requestId).
- Sentry error capture for unhandled exceptions and explicit `captureException` / `captureMessage` calls.
- `PipelineStep` model with per-step timing, cost, model, token counts.
- `PipelineEvent` model for structured per-step log events.
- `AiServiceError` model for external AI failures.
- Admin analytics views: costs, usage, quality, pipeline performance, revenue.
- `GET /api/health/deep` for component health.

### Gaps

**5.1 No external metrics/dashboard.**
All observability is internal (admin UI + Sentry). There is no integration with Cloudflare Workers Analytics, Grafana, Datadog, or similar. Ops would rely on manual admin dashboard checks or Sentry alert emails.

**5.2 No structured logging for queue handlers.**
Queue handlers use `console.log`/`console.error` with strings, not the structured JSON format used by `requestLogger`. Correlating queue processing errors with HTTP requests via `requestId` is manual at best.

**5.3 No p95/p99 latency tracking.**
`PipelineStep.durationMs` tracks per-step timing, but analytics aggregate only averages. No percentile latency is surfaced to admin. The admin analytics "processing speed" chart shows daily averages.

**5.4 Sentry trace sample rate is hardcoded at 10%.**
`tracesSampleRate: 0.1` is hardcoded in `worker/index.ts`. It cannot be adjusted via `PlatformConfig` without a redeploy. At high traffic, 10% may miss critical traces; at low traffic, it's fine but inflexible.

**5.5 No alerting on budget overruns.**
`metrics.budgetStatus` in the cost analytics endpoint returns a hardcoded `"on_track"` string. There is no actual budget threshold configured or checked, and no alert fires when AI costs exceed a threshold.

**5.6 Efficiency score is a placeholder.**
`efficiencyScore: 85` in the cost analytics response is hardcoded. This signals intent but provides false assurance.

---

## 6. Operations

### What exists
- CI/CD via GitHub Actions with `wrangler deploy` for staging and production.
- `PlatformConfig`-backed runtime configuration with per-stage pipeline enable/disable.
- Feature flags system (`worker/lib/feature-flags.ts`) with per-user rollout, plan availability, allowlist/denylist, and date ranges.
- `SCRIPT_TOKEN` for CI/script authentication bypassing Clerk.
- Documented deployment guide (`docs/guides/production-deployment.md`).
- `npm run db:push:*:force` for breaking schema changes.

### Gaps

**6.1 No rollback mechanism for worker deployments.**
`wrangler rollback` exists in the Cloudflare toolchain but is not documented or scripted. If a bad deploy goes to production, the rollback path is not documented.

**6.2 No canary or blue-green deployment.**
All deploys are all-or-nothing across Cloudflare's edge. There is no way to roll out to a percentage of traffic before full deployment.

**6.3 Feature flags not wired to core pipeline paths.**
`isFeatureEnabled` exists and is called in `GET /api/me` to return active flags to the frontend. But pipeline queue handlers do not use feature flags to gate experimental processing logic. New pipeline changes ship to all users simultaneously.

**6.4 No documented incident runbook.**
There is no `docs/runbooks/` directory or incident response guide. When the pipeline is down, the on-call path (check admin dashboard → disable pipeline.enabled → retry failed jobs) is implicit knowledge.

**6.5 Database migration strategy is risky.**
`prisma db push` is non-transactional for breaking changes. The documented workaround (`db:push:*:force` before re-triggering CI) is manual and error-prone. There is no migration history (Prisma migrations vs. push).

---

## 7. Billing

### What exists
- Stripe Checkout and Customer Portal integration.
- `Plan` model with detailed limits: `briefingsPerWeek`, `onDemandRequestsPerWeek`, `maxPodcastSubscriptions`, `maxDurationMinutes`, `maxStorageDays`, `concurrentPipelineJobs`, `retryBudget`.
- Stripe webhook handler updates user plan on subscription events.
- Revenue analytics (`GET /admin/analytics/revenue`) with MRR, ARR, byPlan breakdown.
- Trial days support (`Plan.trialDays`).

### Gaps

**7.1 Plan limits are not enforced at request time.**
This is the most critical billing gap. The `Plan` model defines `briefingsPerWeek`, `onDemandRequestsPerWeek`, `maxPodcastSubscriptions`, etc., but these are not checked before creating briefing requests or subscriptions. A free-tier user can:
- Subscribe to unlimited podcasts (no check against `maxPodcastSubscriptions`).
- Generate unlimited on-demand briefings (no check against `onDemandRequestsPerWeek`).
- Request any duration tier (no check against `maxDurationMinutes`).

**7.2 No usage metering.**
There is no counter tracking how many briefings or on-demand requests a user has consumed in the current billing period. Without metering, limit enforcement cannot be implemented without expensive real-time DB aggregations.

**7.3 Churn detection is a proxy.**
"Users who downgraded to the default plan in the last 30 days" (`recentChurn` in revenue analytics) is not true churn (Stripe subscription cancellation). Actual churn requires tracking Stripe `customer.subscription.deleted` events, which are handled in the Stripe webhook but not surfaced as a metric.

**7.4 No dunning or payment failure handling.**
The Stripe webhook handles `invoice.payment_failed` by checking `paymentIntent.status`, but there is no dunning workflow (reminder emails, grace period, account suspension on repeated failure). Failed payments silently leave the user on the paid plan.

**7.5 No invoice or billing history for users.**
Users can access the Stripe Customer Portal, but there is no in-app billing history view or invoice download. This is a common SaaS table-stakes feature.

**7.6 Annual plan and trial mechanics are unverified.**
`Plan.priceCentsAnnual` and `Plan.trialDays` are schema fields, but the seeding and UI flows for annual subscriptions and trials are not visible in the reviewed routes. It is unclear if these work end-to-end.

---

## 8. Multi-Tenancy and Data Isolation

### What exists
- All user data is scoped by `userId` with Prisma `where: { userId }` filters in route handlers.
- `onDelete: Cascade` on user-owned relations ensures hard deletion cleans up data.
- Clerk provides identity isolation at the auth layer.
- `requireAuth` middleware enforces authentication before any user data access.

### Gaps

**8.1 Clips are shared across users — by design, but with privacy implications.**
`Clip` records (including `narrativeText` and `audioKey`) are shared across all users who request the same episode/duration/voice combination. A `Briefing` wraps a `Clip` per user, but the underlying audio is shared. If a user's custom prompt instructions are ever incorporated into narrative generation, this sharing would leak personalization data across users. Currently, custom instructions are a plan feature not implemented in the pipeline.

**8.2 WorkProducts are not user-scoped.**
`WorkProduct` has an optional `userId` field, but most work products (TRANSCRIPT, CLAIMS, NARRATIVE, AUDIO_CLIP) are episode-scoped, not user-scoped. There is no mechanism to delete a user's associated work products when they delete their account, since the underlying episode work products may be shared.

**8.3 R2 keys use episodeId, not userId.**
Audio clips in R2 follow the pattern `wp/clip/{episodeId}/{durationTier}/{voice}.mp3`. These are not access-controlled at the R2 level — any request with the key can access the audio. Audio serving depends on the application correctly scoping access, not on storage-level ACLs.

**8.4 No per-tenant resource quotas at the infrastructure level.**
There is no Cloudflare per-user rate limiting at the infrastructure level — only the application-level rate limiter (which uses in-memory counters with a KV fallback). A single user making a large number of API requests degrades capacity for all users on the same worker isolate.

---

## 9. Rate Limiting and Abuse Prevention

### What exists
- `rateLimit` middleware with KV-backed persistence (optional) or in-memory fallback.
- Per-endpoint limits: briefing generation (10/hour), podcast subscribe (5/min), general API (120/min).
- API key system with scope-based access control.
- `X-RateLimit-*` response headers.

### Gaps

**9.1 Rate limiting falls back to per-isolate in-memory counters without KV.**
If `RATE_LIMIT_KV` binding is not configured (which appears to be optional per the codebase), rate limits are per-isolate and not shared across Cloudflare's edge. A user could hit 120 req/min on each of many edge nodes simultaneously, effectively multiplying the effective limit. This is documented in the code comment but not surfaced as a deployment requirement.

**9.2 No abuse detection or anomaly alerting.**
There is no detection for unusual patterns: a user consistently hitting the rate limit, a sudden spike in pipeline job submissions, or a flood of on-demand requests from a single account. The rate limiter blocks, but does not alert.

**9.3 No IP-based blocking or allowlisting.**
Only `cf-connecting-ip` is used as a fallback identifier when no auth is present. There is no mechanism to block IP ranges or specific IPs that are abusing the API.

**9.4 Webhook endpoints lack additional abuse protection.**
Stripe and Clerk webhooks are excluded from rate limiting (correct for server-to-server). But there is no IP allowlist limiting webhook calls to Stripe/Clerk IP ranges, relying entirely on HMAC signature verification.

**9.5 No concurrency limits for pipeline jobs.**
`Plan.concurrentPipelineJobs` is a schema field but is not enforced when creating `PipelineJob` records. A single user can submit a large briefing request that creates many simultaneous pipeline jobs, consuming disproportionate queue capacity.

---

## Documentation Currency Assessment

| Document | Status |
|----------|--------|
| `docs/architecture.md` | Accurate. Reflects 9 queues, multi-provider AI, correct queue names, cron jobs. Minor: says "9 Cloudflare Queues" in the tech stack table but the queue table lists 9 queues while the CLAUDE.md says "7 Cloudflare Queues" — slight discrepancy. |
| `docs/pipeline.md` | Accurate. Pipeline stages, orchestrator pattern, and WorkProduct registry match implementation. |
| `docs/admin-platform.md` | Mostly accurate. Describes all admin pages including the newer ones (Catalog Discovery, Episode Refresh, Claims Benchmark, STT Benchmark, Voice Presets, AI Models, Prompts). |
| `docs/data-model.md` | Not reviewed in full — likely current since schema is authoritative. |
| `docs/api-reference.md` | Not reviewed — may have drifted as routes have been added. |
| `docs/guides/production-deployment.md` | Not reviewed, but known to exist. |
| Missing: `docs/runbooks/` | No incident runbooks exist. |
| Missing: Billing enforcement docs | No documentation of which plan limits are enforced vs. aspirational. |
| Missing: Security threat model | No threat model document. |

---

## Priority Ranking

| Priority | Gap | Effort | Risk if Unaddressed |
|----------|-----|--------|---------------------|
| P0 | Plan limits not enforced (billing gap 7.1) | High | Revenue loss, free tier abuse |
| P0 | User suspension doesn't block access (admin gap 2.2) | Low | Security/compliance |
| P1 | Usage metering missing (billing gap 7.2) | High | Cannot enforce limits without this |
| P1 | Rate limiting in-memory fallback (security gap 9.1) | Low | Limits bypassed without KV configured |
| P1 | Analytics queries load all rows (performance gap 3.2, 3.3) | Medium | OOM/slowness at scale |
| P1 | No alerting on cron failures or cost overruns | Medium | Silent failures, surprise bills |
| P2 | GDPR right to erasure / data export | Medium | Legal compliance |
| P2 | Audit coverage gaps (plan/prompt/API key changes) | Low | Compliance, debugging |
| P2 | No dead letter queue / queue exhaustion alerting | Medium | Lost jobs silently |
| P2 | Circuit breakers for AI providers | High | Cascading failures |
| P3 | No external metrics dashboard | Medium | Operational visibility |
| P3 | Rollback runbook missing | Low | Slower incident recovery |
| P3 | Annual plan / trial flow unverified | Low | Billing edge case |
| P3 | Audio R2 keys not access-controlled at storage level | Medium | Data leakage if URL guessed |
