# Staging + Production Environment Design

## Overview

Add a staging environment alongside production using Wrangler's built-in environment support. Staging is the default deploy target, used for full integration testing and Playwright E2E automation. Production requires manual promotion.

## Architecture

### Wrangler Environment Pattern

Single `wrangler.jsonc` with two environments:

- **Default (no flag)** = staging
- **`--env production`** = production

Each environment gets its own Worker name, R2 bucket, Hyperdrive config, queue set, secrets, and cron schedule.

### Infrastructure Layout

| Resource | Staging (default) | Production (`--env production`) |
|----------|------------------|-------------------------------|
| Worker name | `blipp-staging` | `blipp` |
| URL | `blipp-staging.YOUR-SUBDOMAIN.workers.dev` | `podblipp.com` (custom domain) |
| R2 bucket | `blipp-audio-staging` | `blipp-audio` |
| Hyperdrive | `blipp-db-staging` → Neon `staging` DB | `blipp-db` → Neon `neondb` DB |
| Queues (7) | `*-staging` suffix | No suffix |
| Cron | **None** (tests trigger on-demand) | `*/30 * * * *` |
| Secrets | Own set per env | Own set per env |

### Queue Names

| Binding | Staging Queue | Production Queue |
|---------|--------------|-----------------|
| `FEED_REFRESH_QUEUE` | `feed-refresh-staging` | `feed-refresh` |
| `TRANSCRIPTION_QUEUE` | `transcription-staging` | `transcription` |
| `DISTILLATION_QUEUE` | `distillation-staging` | `distillation` |
| `NARRATIVE_GENERATION_QUEUE` | `narrative-generation-staging` | `narrative-generation` |
| `AUDIO_GENERATION_QUEUE` | `clip-generation-staging` | `clip-generation` |
| `BRIEFING_ASSEMBLY_QUEUE` | `briefing-assembly-staging` | `briefing-assembly` |
| `ORCHESTRATOR_QUEUE` | `orchestrator-staging` | `orchestrator` |

## Database

### Neon Setup

Single Neon project (`blipp-prod`), two databases sharing compute:

```
blipp-prod (Neon project)
├── neondb          ← production
└── staging         ← staging/testing
```

### Hyperdrive Configs

Created via CLI:

```bash
npx wrangler hyperdrive create blipp-db-staging \
  --connection-string="postgres://USER:PASS@ep-xxxx-pooler.REGION.aws.neon.tech/staging"

npx wrangler hyperdrive create blipp-db \
  --connection-string="postgres://USER:PASS@ep-xxxx-pooler.REGION.aws.neon.tech/neondb"
```

### Schema & Seed

Both databases get identical schema and seed data. Staging PlatformConfig is then updated to use cheapest AI models:

- STT: Whisper Large v3 Turbo on Cloudflare
- Distillation: Haiku 4.5 on Anthropic
- Narrative: Haiku 4.5 on Anthropic
- TTS: MeloTTS on Cloudflare

## Shared Services

### Clerk

- **Staging:** Reuses existing Development instance (`pk_test_`/`sk_test_`). Add webhook endpoint pointing to `workers.dev` URL.
- **Production:** Production instance (`pk_live_`/`sk_live_`). Webhook endpoint at `podblipp.com`. Requires custom Google OAuth client, domain DNS setup, and certificate deployment.

### Stripe

- **Staging:** Reuses existing sandbox (`sk_test_`). Add webhook endpoint pointing to `workers.dev` URL. Playwright uses test card `4242 4242 4242 4242`.
- **Production:** Live mode (`sk_live_`). Requires account activation, products/prices creation, webhook endpoint at `podblipp.com`, customer portal config.

### AI Services

Same API keys for both environments. Cost isolation achieved via PlatformConfig model selection:

- Staging: cheapest models (pennies per pipeline run)
- Production: recommended models (Sonnet, GPT-4o-mini TTS, etc.)

### Podcast Index

Same API key/secret for both environments.

## Secrets Management

Each environment has its own secret store. Set independently:

```bash
# Staging (default)
npx wrangler secret put CLERK_SECRET_KEY

# Production
npx wrangler secret put CLERK_SECRET_KEY --env production
```

### Secrets That Differ

| Secret | Staging | Production |
|--------|---------|------------|
| `CLERK_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `CLERK_WEBHOOK_SECRET` | Staging endpoint secret | Production endpoint secret |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Staging endpoint secret | Production endpoint secret |

### Secrets That Share Values

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `GOOGLE_STT_API_KEY`, `PODCAST_INDEX_KEY`, `PODCAST_INDEX_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — same values, set independently in each environment.

Optional secrets (set only if accounts exist): `NEON_API_KEY`, `NEON_PROJECT_ID`, `ASSEMBLYAI_API_KEY`, `GOOGLE_STT_API_KEY`.

### Automation

`scripts/set-secrets.sh` updated to accept optional `--env` flag:

```bash
bash scripts/set-secrets.sh secrets-staging.env
bash scripts/set-secrets.sh secrets-production.env --env production
```

## Webhook Endpoints

### Clerk

| Instance | Endpoint URL | Events |
|----------|-------------|--------|
| Development | `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/clerk` | `user.created`, `user.updated`, `user.deleted` |
| Production | `https://podblipp.com/api/webhooks/clerk` | `user.created`, `user.updated`, `user.deleted` |

### Stripe

| Mode | Endpoint URL | Events |
|------|-------------|--------|
| Sandbox | `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Live | `https://podblipp.com/api/webhooks/stripe` | Same 4 events |

Staging webhook endpoints are created after first deploy (once the `workers.dev` URL is known).

## CI/CD

### Workflows

**`deploy-staging.yml`** — replaces current `deploy.yml`:

```
Trigger: push to main
Steps:
  1. Checkout
  2. Setup Node 22
  3. npm ci --legacy-peer-deps
  4. npx prisma generate
  5. npm run typecheck
  6. npm test (unit tests)
  7. Build with staging Vite env vars
     VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
     VITE_APP_URL=https://blipp-staging.YOUR-SUBDOMAIN.workers.dev
  8. npx wrangler deploy (default = staging)
  9. Run Playwright E2E tests against staging URL
```

**`deploy-production.yml`** — manual trigger:

```
Trigger: workflow_dispatch
Steps:
  1. Checkout
  2. Setup Node 22
  3. npm ci --legacy-peer-deps
  4. npx prisma generate
  5. npm run typecheck
  6. npm test (unit tests)
  7. Build with production Vite env vars
     VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
     VITE_APP_URL=https://podblipp.com
  8. npx wrangler deploy --env production
```

### GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy (both environments) |
| `VITE_CLERK_PUBLISHABLE_KEY_STAGING` | `pk_test_...` for staging builds |
| `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` | `pk_live_...` for production builds |

`VITE_APP_URL` values are hardcoded in each workflow YAML (not secrets — they're public URLs):
- `deploy-staging.yml`: `VITE_APP_URL=https://blipp-staging.YOUR-SUBDOMAIN.workers.dev`
- `deploy-production.yml`: `VITE_APP_URL=https://podblipp.com`

### Production Deploy Gate

The `deploy-production.yml` workflow should verify that the most recent `deploy-staging.yml` run (including E2E tests) succeeded before allowing production deploy. Implement via GitHub Actions `workflow_run` condition or a status check at the start of the production workflow.

### Playwright in CI

- Base URL: staging `workers.dev` URL (hardcoded in workflow as `STAGING_URL` env var)
- The `workers.dev` URL is deterministic: `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev` (based on worker name + account subdomain). Discovered on first deploy, then hardcoded.
- Test users: created via Clerk dev instance
- Stripe: test card numbers
- Pipeline: triggered on-demand via API calls in tests
- Cleanup: tests clean up their own data

## Code Changes

### `worker/index.ts` — CORS Origins

```typescript
// Replace
"https://blipp.app", "https://www.blipp.app"
// With
"https://podblipp.com", "https://www.podblipp.com"
```

**Note:** The SPA is served by the same Worker, so browser requests from the SPA to `/api/*` are same-origin and do not trigger CORS. However, external tools (Playwright, Firecrawl, etc.) making cross-origin requests to the staging API need the origin allowed. Set the `ALLOWED_ORIGINS` env var for staging to include the `workers.dev` URL. For production, the hardcoded list suffices.

### `worker/routes/billing.ts` — Stripe Fallback Origin

Replace the hardcoded fallback with an environment binding so each environment redirects correctly:

```typescript
// Replace
const origin = c.req.header("origin") ?? "https://blipp.app";
// With
const origin = c.req.header("origin") ?? (c.env.APP_ORIGIN || "https://podblipp.com");
```

Add `APP_ORIGIN` as a Wrangler variable (not a secret) per environment:
- Staging: `APP_ORIGIN=https://blipp-staging.YOUR-SUBDOMAIN.workers.dev`
- Production: `APP_ORIGIN=https://podblipp.com`

This also requires adding `APP_ORIGIN?: string` to the `Env` type in `worker/types.ts`.

### `wrangler.jsonc` — Restructure for Two Environments

The current top-level `"name": "blipp"` stays as-is for production (preserving the existing Worker). Staging is added via `env.staging`, but we **invert the default**: the top-level config is production, and staging is the Wrangler environment.

**However**, since we want `wrangler deploy` (no flag) to target staging for safety, we instead:

- Rename top-level `"name"` to `"blipp-staging"`
- Add `env.production` with `"name": "blipp"`

**Migration plan:** The existing deployed `blipp` Worker must be preserved. On the first deploy after this change:
1. Deploy staging first (`wrangler deploy`) — creates a new `blipp-staging` Worker
2. Deploy production (`wrangler deploy --env production`) — this targets the existing `blipp` Worker name, so the production deployment is seamless

**Important:** Wrangler does NOT merge arrays in environment overrides — it replaces them entirely. The `env.production` block must fully re-declare all 7 queue producers, all 7 queue consumers (with `max_batch_size` and `max_retries`), all Hyperdrive configs, and all R2 bucket bindings.

**Inherited by production (no override needed):** `assets` config (SPA handling, `run_worker_first`), `ai` binding (`AI`), `compatibility_date`, `compatibility_flags`, `main` entry point.

## Deployment Guide Changes

Restructure `docs/guides/production-deployment.md` to cover both environments:

1. Accounts (shared) → unchanged
2. Cloudflare infra → 2 R2 buckets, 14 queues, 2 Hyperdrive configs
3. Neon → 2 databases in same project, schema+seed both
4. Clerk → staging (dev instance webhook) then production (full setup)
5. Stripe → staging (sandbox webhook) then production (full setup)
6. AI/Podcast/Ads/VAPID → unchanged (shared)
7. CI/CD → two workflows, Playwright, Vite env vars
8. Domain → `podblipp.com` (production only)
9. Secrets → two passes (staging then production `--env production`)
10. Deploy → staging first (get URL for webhooks), then production
11. Verification → smoke tests for both
12. Runbook → staging-specific tasks added

Deploy staging first to get the `workers.dev` URL, then create webhook endpoints, then verify, then deploy production.

## Security

- Staging is not behind Cloudflare Access — relies on `workers.dev` URL obscurity
- **Known risk:** The `workers.dev` URL is derived from the worker name (`blipp-staging`), which is somewhat guessable. However, the Cloudflare account subdomain adds randomness. Mitigation: staging uses Clerk dev instance (no real users), Stripe sandbox (no real payments), and cheapest AI models (minimal cost exposure). If abuse is detected, Cloudflare Access can be added later (free for up to 50 users).
- No custom domain for staging
- Staging uses Clerk dev instance (test users only)
- Staging uses Stripe sandbox (no real payments)
- AI keys are shared but staging uses cheapest models (minimal cost exposure)

## Cost Impact

| Item | Additional Cost |
|------|----------------|
| Neon second database | $0 (same project, shared compute) |
| R2 second bucket | $0 (pay per storage/request only) |
| 7 additional queues | $0 (pay per message only) |
| Second Worker | $0 (included in Workers Paid) |
| Clerk dev instance | $0 (free) |
| Stripe sandbox | $0 (free) |
| AI test runs | Pennies per pipeline run (cheapest models) |
| **Total fixed cost** | **$0** |
