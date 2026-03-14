# Remaining Items

**Date:** 2026-03-14
**Status:** Everything implementable as code has been built. These items require manual setup, external services, or are low-priority improvements.

---

## Requires Manual Setup (you need to do these)

### 1. Generate and configure VAPID keys for push notifications
```bash
npx web-push generate-vapid-keys
```
Then add to `.dev.vars` and production secrets:
```
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:you@blipp.app
```
Production: `wrangler secret put VAPID_PUBLIC_KEY` etc.

### 2. Create Prisma migration baseline
```bash
npx prisma migrate dev --name baseline
```
This generates the initial migration SQL from the current schema. Requires a running database connection. See `docs/guides/prisma-migrations.md` for the full workflow.

### 3. Configure Neon API credentials for backup verification
Get from Neon dashboard (Settings > API Keys):
```
wrangler secret put NEON_API_KEY
wrangler secret put NEON_PROJECT_ID
```

### 4. Configure Cloudflare API token for CI/CD deploy
Create a CF API token with Workers edit permission, add as GitHub repo secret:
- GitHub repo > Settings > Secrets > `CLOUDFLARE_API_TOKEN`

### 5. Set Hyperdrive config ID in wrangler.jsonc
Create a Hyperdrive config in CF dashboard, replace `<hyperdrive-config-id>` on line 14.

### 6. Create branded PWA icons
Replace placeholder icons at:
- `public/icon-192.png` (192x192 PNG)
- `public/icon-512.png` (512x512 PNG)

### 7. Set up Sentry error tracking
When ready to enable real error monitoring:
1. Create Sentry project at sentry.io
2. Install: `npm install @sentry/cloudflare --legacy-peer-deps`
3. Replace `worker/lib/sentry.ts` stub with real Sentry SDK integration
4. Add `SENTRY_DSN` to worker secrets

### 8. Upgrade rate limiting to KV (production)
Current in-memory rate limiter resets on every Worker redeploy. For production:
1. Create KV namespace: `wrangler kv:namespace create RATE_LIMIT_KV`
2. Add binding to `wrangler.jsonc`
3. Update `worker/middleware/rate-limit.ts` to use KV instead of Map

---

## External Service Integration (not code changes)

### 9. Metrics export (Prometheus/Datadog)
Requires external service account. Options:
- Cloudflare Workers Analytics Engine (built-in)
- Datadog agent for Cloudflare Workers
- Custom `/metrics` endpoint in Prometheus format

### 10. Log shipping (Logpush)
Configure in Cloudflare dashboard:
- Workers > Logs > Logpush
- Destination: Datadog, Elasticsearch, S3, etc.

### 11. IaC / Terraform
Define infrastructure as code for reproducible deployments:
- R2 buckets, Queues, Hyperdrive configs, KV namespaces
- Low priority until infrastructure needs replication

---

## Low-Priority Code Quality (optional)

### 12. Reduce `prisma: any` casts
~50+ instances of `c.get("prisma") as any` throughout routes. Caused by Hono's context type system not fully supporting Prisma types. Could be improved with a custom typed helper but is not a runtime risk.

### 13. Revenue analytics from real Stripe data
Current `/admin/analytics/revenue` calculates MRR from plan prices x user counts. For accurate revenue data, integrate Stripe's Billing API to get actual subscription revenue, failed charges, and refunds.

### 14. Prisma `as any` in queue handlers
Similar to #12 — queue handlers cast prisma extensively. Improving Prisma type safety across the codebase would be a dedicated refactoring effort.
