# Remaining SaaS Readiness Gaps

**Date:** 2026-03-14
**Status:** Items NOT covered by Phases 1-6 implementation
**Source:** [SaaS Readiness Gaps Analysis](./2026-03-14-saas-readiness-gaps.md)

---

## What's Already Done

The following SaaS gaps were addressed in Phases 1-6:
- Security: Webhook verification, CORS, IDOR, mass assignment, rate limiting, parseSort allowlists
- Observability: Structured logging, correlation IDs, AI error tracking, request logging, global onError
- Governance: Audit logging, GDPR export/deletion
- Operations: Health checks, feature flags, backup verification, cost alerting, usage metering
- UX: Onboarding, skeletons, toasts, empty states

---

## Remaining Gaps (grouped by priority)

### P0 — Before Public Launch

**1. Connection String in Git**
- `wrangler.jsonc` contains a real Neon connection string in `localConnectionString`
- **Fix:** Move to `.dev.vars` (already gitignored), replace with placeholder in `wrangler.jsonc`
- **Effort:** 10 minutes
- **Files:** `wrangler.jsonc`

### P1 — Before Scaling

**2. Database Indexes for Hot Queries**
- No composite indexes beyond Prisma defaults
- **Add indexes:**
  - `FeedItem(userId, status, createdAt)` — feed listing
  - `FeedItem(userId, listened, createdAt)` — history queries
  - `PipelineJob(requestId, status)` — orchestrator lookups
  - `Subscription(userId)` — subscription counts
  - `Episode(podcastId, publishedAt)` — episode listing
- **Effort:** 0.5 day
- **Files:** `prisma/schema.prisma`

**3. Stripe Webhook Completeness**
- Missing handlers for: `customer.subscription.updated`, `invoice.payment_failed`, `customer.subscription.paused`
- **Why:** Plan changes, failed renewals, and paused subscriptions silently ignored
- **Effort:** 1 day
- **Files:** `worker/routes/webhooks/stripe.ts`

**4. CI/CD Pipeline**
- No GitHub Actions for lint, typecheck, test, deploy
- No staging environment
- **Effort:** 1-2 days
- **Files:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**5. Prisma Migrate for Production**
- Currently using `prisma db push` (no migration history)
- Production data changes need reversible migrations
- **Effort:** 0.5 day
- **Files:** `prisma/migrations/`

**6. CSP Headers**
- No Content Security Policy headers on the SPA
- **Effort:** 0.5 day
- **Files:** `worker/index.ts` or `worker/middleware/security-headers.ts`

### P2 — For Reliability at Scale

**7. Circuit Breakers for AI Providers**
- No automatic failover when a provider goes down
- All pipeline jobs fail and exhaust retries
- **Design:** Failure counter per provider, trip after N failures in window, try next provider from registry
- **Effort:** 2 days
- **Files:** `worker/lib/circuit-breaker.ts`, queue handlers

**8. Provider Failover**
- Single provider per stage, no automatic retry with alternative
- **Design:** On AiProviderError, check if alternate provider available in AI model registry, retry once
- **Effort:** 1 day (depends on circuit breakers)
- **Files:** Queue handlers, `worker/lib/model-resolution.ts`

**9. Data Retention Policies**
- Pipeline data (jobs, steps, events, work products) grows unbounded
- R2 work products have no TTL or lifecycle rules
- **Overlaps with:** [Catalog & Episode Management](./remaining-catalog-episode-management.md) Phase 4 (Episode Aging)
- **Design:** Scheduled job to archive/delete old pipeline data + R2 lifecycle rules
- **Effort:** 1-2 days
- **Files:** `worker/lib/data-retention.ts`, `worker/queues/index.ts`

**10. Caching Strategy**
- Only PlatformConfig has cache (60s TTL)
- No caching for: feed items, podcast catalog, user plan data
- **Design:** Cloudflare Cache API or KV for hot-path data
- **Effort:** 2 days
- **Files:** `worker/middleware/cache.ts`, route handlers

**11. DLQ Monitoring**
- Failed messages after 3 retries are dead-lettered with no visibility
- **Design:** Count dead-lettered messages, surface in admin dashboard
- **Effort:** 0.5 day

### P3 — For Enterprise Readiness

**12. Error Tracking Service (Sentry)**
- Errors go to console.error with limited retention (24h free, 30d paid)
- **Effort:** 0.5 day
- **Files:** `worker/lib/sentry.ts`, `worker/index.ts`

**13. Metrics Export**
- No Prometheus/Datadog export
- **Design:** Cloudflare Workers Analytics Engine or custom metrics endpoint
- **Effort:** 2 days

**14. Log Shipping**
- Logs go to console only (Cloudflare Workers log retention limited)
- **Design:** Logpush to external service (Datadog, Elasticsearch)
- **Effort:** 1 day (mostly Cloudflare config)

**15. Revenue Analytics**
- No MRR, ARR, churn tracking in admin dashboard
- **Effort:** 1-2 days
- **Files:** `worker/routes/admin/analytics.ts`, `src/pages/admin/analytics.tsx`

**16. Trial Expiration & Dunning**
- No trial expiration handling (notification + auto-downgrade)
- No dunning for failed payment retries
- **Effort:** 1 day
- **Files:** `worker/queues/index.ts` (scheduled), `worker/routes/webhooks/stripe.ts`

**17. User Suspend/Ban**
- No ability to suspend users from admin panel
- **Design:** Add `status` field to User model (active/suspended/banned)
- **Effort:** 0.5 day
- **Files:** `prisma/schema.prisma`, `worker/middleware/auth.ts`, `worker/routes/admin/users.ts`

**18. Push Notifications**
- PWA shell exists but no push notification support
- **Design:** Web Push subscription storage, push sending via `web-push`
- **Effort:** 2 days
- **Files:** `prisma/schema.prisma` (PushSubscription model), `worker/lib/push.ts`, `src/`

**19. Offline Data Caching**
- Service worker passes through all requests (no caching)
- **Design:** Cache shell + feed data for offline viewing
- **Effort:** 2 days
- **Files:** `public/sw.js`

**20. IaC (Terraform/Pulumi)**
- R2 buckets, queues, Hyperdrive created manually
- **Effort:** 2-3 days

---

## Priority Execution Order

| Order | Items | Effort | Rationale |
|-------|-------|--------|-----------|
| 1 | #1 (connection string) | 10 min | Security, trivial fix |
| 2 | #2 (DB indexes) | 0.5d | Performance foundation |
| 3 | #3 (Stripe webhooks) + #16 (trial/dunning) | 1.5d | Billing correctness |
| 4 | #4 (CI/CD) + #5 (Prisma migrate) | 2d | Deployment safety |
| 5 | #6 (CSP) | 0.5d | Security header |
| 6 | #7+#8 (circuit breakers + failover) | 3d | Reliability at scale |
| 7 | #9 (data retention) | 1d | Storage costs |
| 8 | #10 (caching) | 2d | Performance at scale |
| 9 | Everything else | Variable | As needed |
