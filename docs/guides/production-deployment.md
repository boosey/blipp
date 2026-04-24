# Blipp Deployment Checklist & Runbook

Staging deploys as `blipp-staging` to `staging.podblipp.com`. Production deploys as `blipp` to `podblipp.com`. Work through this top to bottom on a fresh setup — every step's prerequisites are met by prior steps.

Companion doc: [`external-services.md`](./external-services.md) is the flat service inventory (non-code accounts, mailboxes, marketing tags, mobile stores). This doc focuses on what the Worker needs to run.

## Credentials Handling — Read This First

- **No secrets in the repo.** Every value that looks like a key, token, password, or webhook secret belongs in a password manager, not in `.md`, `.env`, or `.template` files. The templates in `scripts/templates/` intentionally ship with empty placeholders.
- **One canonical location per service.** Record the vault entry name (e.g. `1Password / Blipp / Clerk (Production)`) alongside each service below — not the secret itself. If a teammate needs the value they open the vault.
- **`.env` / `secrets-*.env` files on disk:** create → push secrets → delete. Never leave them around. They are in `.gitignore` but the safest state is "does not exist."
- **Rotation policy:** rotate any secret that has been pasted into chat, a ticket, an email, a screenshot, or a machine you no longer control. Document rotation events in the service's vault entry notes.

---

## Table of Contents

1. [Phase 1: Accounts](#phase-1-accounts)
2. [Phase 2: Neon Database](#phase-2-neon-database)
3. [Phase 3: Cloudflare Infrastructure](#phase-3-cloudflare-infrastructure)
4. [Phase 4: Push Schema & Seed](#phase-4-push-schema--seed)
5. [Phase 5: Clerk Auth](#phase-5-clerk-auth)
6. [Phase 6: AI & Podcast Services](#phase-6-ai--podcast-services)
7. [Phase 7: Web Push VAPID Keys](#phase-7-web-push-vapid-keys)
8. [Phase 8: GitHub CI/CD](#phase-8-github-cicd)
9. [Phase 9: Set Cloudflare Secrets](#phase-9-set-cloudflare-secrets)
10. [Phase 10: Deploy, Stripe & Webhooks](#phase-10-deploy-stripe--webhooks)
11. [Phase 11: Transactional Email (ZeptoMail) & RevenueCat](#phase-11-transactional-email-zeptomail--revenuecat)
12. [Phase 12: Post-Deploy Verification](#phase-12-post-deploy-verification)
13. [Operational Runbook](#operational-runbook)
14. [Cron Jobs Reference](#cron-jobs-reference)
15. [Automation Scripts](#automation-scripts)

---

## Phase 1: Accounts

Create accounts on all services. Record each one's vault entry name in your password manager as you go — never paste secrets into this document. The same accounts serve both environments unless noted.

### Required for a deployable app

| # | Service | Sign Up | What You Need |
|---|---------|---------|---------------|
| 1 | Cloudflare | https://dash.cloudflare.com/sign-up | Workers Paid ($5/mo) |
| 2 | Neon | https://console.neon.com/signup | Launch plan minimum; Scale for IP allow list |
| 3 | Clerk | https://dashboard.clerk.com/sign-up | Dev + Production instances |
| 4 | Stripe | https://dashboard.stripe.com/register | Sandbox + Live mode |
| 5 | Anthropic | https://console.anthropic.com/ | API credits ($25+) |
| 6 | OpenAI | https://platform.openai.com/ | API credits ($25+) |
| 7 | Podcast Index | https://api.podcastindex.org/signup | Free |
| 8 | GitHub | (you have this) | Actions enabled |

### Required for launch

| # | Service | Sign Up | Purpose |
|---|---------|---------|---------|
| 9 | Zoho Mail | https://www.zoho.com/mail | Mailboxes on `podblipp.com` (welcome@, support@, boose@) |
| 10 | ZeptoMail | https://www.zoho.com/zeptomail | Transactional email API for welcome email (Phase 11) |
| 11 | RevenueCat | https://app.revenuecat.com | iOS IAP / subscriptions via App Store (Phase 11) |
| 12 | Apple Developer | https://developer.apple.com/programs/ | iOS app signing ($99/yr) — see `ios-testflight.md` |
| 13 | App Store Connect | (included with Apple Dev) | TestFlight + App Store listing |

### Optional

| # | Service | Sign Up | Purpose |
|---|---------|---------|---------|
| 14 | Groq | https://console.groq.com | Fast STT/LLM/TTS |
| 15 | Deepgram | https://console.deepgram.com/signup | Nova STT |
| 16 | Google Cloud | https://console.cloud.google.com | Google OAuth for Clerk prod SSO |
| 17 | Google Analytics 4 | https://analytics.google.com | Web traffic analytics (`G-TK6ES8S96S`) |
| 18 | Google Ads | https://ads.google.com | Conversion tracking (`AW-18076796933`) |
| 19 | Buffer | https://buffer.com | Social post scheduling (marketing) |
| 20 | Cloudflare API token | CF dashboard → My Profile → API Tokens | Admin UI worker logs viewer — `CF_API_TOKEN` |
| 21 | Neon API token | Neon → Account settings → API keys | Admin UI backup verification — `NEON_API_KEY` |
| 22 | GitHub PAT | GitHub → Developer settings → Fine-grained tokens | Admin UI "Refresh Apple catalog" — `GITHUB_TOKEN` |

### Cloudflare: Upgrade to Workers Paid

- [ ] Log into https://dash.cloudflare.com
- [ ] Sidebar → **Workers & Pages** → upgrade to **Workers Paid** ($5/mo)
- [ ] This is required for Queues, Cron Triggers, and higher limits

---

## Phase 2: Neon Database

Neon console is at **https://console.neon.com** (not neon.tech).

Neon organizes data as **projects → branches**. Each branch has its own compute endpoint and connection string. The `main` branch is production. A `staging` branch provides an isolated staging environment.

### 2.1 Create Project

- [ ] Log into https://console.neon.com
- [ ] Create a new project named `blipp`
- [ ] Region: closest to your Cloudflare Worker (e.g., `us-east-1`)
- [ ] The project creates a `main` branch with database `neondb` — this is your **production** database

### 2.2 Create Staging Branch

- [ ] Sidebar → **Branches** → **Create branch**
- [ ] Name: `staging`
- [ ] Parent branch: `main`
- [ ] This creates an isolated branch with its own compute endpoint and connection string

### 2.3 Copy Connection Strings

Each branch has its own connection string with a different endpoint. In the **Connection Details** widget, select the branch and ensure the pooled toggle is ON (hostname contains `-pooler`):

- [ ] Select **main** branch → copy pooled connection string → save as production
  - Format: `postgresql://neondb_owner:PASSWORD@ep-XXXX-pooler.REGION.aws.neon.tech:5432/neondb?sslmode=require`
- [ ] Select **staging** branch → copy pooled connection string → save as staging
  - Format: `postgresql://neondb_owner:PASSWORD@ep-YYYY-pooler.REGION.aws.neon.tech:5432/neondb?sslmode=require`
  - Note: different endpoint (`ep-YYYY`) but same database name (`neondb`) — the branch provides isolation
- [ ] Save both strings to your password manager — needed in Phase 3 and Phase 4

### 2.4 Configure Settings

- [ ] Connection pooling is **on by default** — verify the `-pooler` hostname is shown
- [ ] **Settings > Compute**: set min compute to 0.25 CU+ to reduce cold starts

**All plans** (Free / Launch / Scale):
- [ ] Point-in-time restore — Free: 6-hour window; Launch: up to 7 days; Scale: up to 30 days

**Launch plan or higher:**
- [ ] Protect your main branch to prevent accidental schema changes

**Scale plan only:**
- [ ] IP allow list — restrict database access to Cloudflare IPs

### 2.5 Create Config File for Scripts

```bash
cp scripts/templates/neon-config.env.template neon-config.env
```

- [ ] Edit `neon-config.env` — paste both connection strings from step 2.3
- [ ] Keep this file — it's used by both `setup-db.sh` (Phase 4) and `setup-infra.sh` (Phase 3). Delete it after both are done.

---

## Phase 3: Cloudflare Infrastructure

**Requires:** `neon-config.env` from Phase 2.5.

### Automated (Recommended)

Run the setup script — it creates R2 buckets, queues (one per binding per env, plus the dead-letter and feed-refresh-retry queues), 2 Hyperdrive configs, and patches `wrangler.jsonc` with the Hyperdrive IDs:

```bash
bash scripts/setup-infra.sh neon-config.env
```

- [ ] Script completed successfully
- [ ] Verify `wrangler.jsonc` has real Hyperdrive IDs (not placeholders)

> The authoritative list of queue bindings is `wrangler.jsonc`. If `setup-infra.sh` falls behind, `wrangler deploy` will auto-create any missing queue on first deploy.

### Manual Alternative

If the script fails or you prefer manual setup:

#### 3.1 Create R2 Buckets

- [ ] Sidebar → **R2** → **Create bucket** → `blipp-audio-staging`
- [ ] **Create bucket** again → `blipp-audio`

#### 3.2 Create Queues (24 total: 12 per environment)

```bash
# Staging (12 queues — 10 producers + feed-refresh-retry + dead-letter)
npx wrangler queues create feed-refresh-staging
npx wrangler queues create feed-refresh-retry-staging
npx wrangler queues create distillation-staging
npx wrangler queues create narrative-generation-staging
npx wrangler queues create clip-generation-staging
npx wrangler queues create briefing-assembly-staging
npx wrangler queues create transcription-staging
npx wrangler queues create orchestrator-staging
npx wrangler queues create catalog-refresh-staging
npx wrangler queues create content-prefetch-staging
npx wrangler queues create welcome-email-staging
npx wrangler queues create dead-letter-staging

# Production (12 queues — same names, no -staging suffix)
npx wrangler queues create feed-refresh
npx wrangler queues create feed-refresh-retry
npx wrangler queues create distillation
npx wrangler queues create narrative-generation
npx wrangler queues create clip-generation
npx wrangler queues create briefing-assembly
npx wrangler queues create transcription
npx wrangler queues create orchestrator
npx wrangler queues create catalog-refresh
npx wrangler queues create content-prefetch
npx wrangler queues create welcome-email
npx wrangler queues create dead-letter
```

Queues are also auto-created by `wrangler deploy` — you can skip this and let the first deploy handle it.

#### 3.3 Create Hyperdrive Configs

Use the connection strings from Phase 2:

```bash
npx wrangler hyperdrive create blipp-db-staging \
  --connection-string="YOUR_STAGING_CONNECTION_STRING"

npx wrangler hyperdrive create blipp-db \
  --connection-string="YOUR_PRODUCTION_CONNECTION_STRING"
```

Each command outputs a config ID. Paste them into `wrangler.jsonc`:
- Replace `<staging-hyperdrive-id>` with the staging ID
- Replace `<production-hyperdrive-id>` with the production ID

### 3.4 Create API Token (for CI/CD)

- [ ] **My Profile > API Tokens > Create Token**
- [ ] Template: **Edit Cloudflare Workers**
- [ ] Scope: your account
- [ ] **Save the token** — needed for GitHub in Phase 8

---

## Phase 4: Push Schema & Seed

**Requires:** Neon connection strings from Phase 2, `neon-config.env` created in Phase 2.4.

### Automated

```bash
bash scripts/setup-db.sh neon-config.env
```

- [ ] Schema pushed to both databases
- [ ] Both databases seeded (Plans, AI Model Registry, PlatformConfig)

### Manual Alternative

```bash
# Staging
DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" npx prisma migrate deploy
DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" npx prisma db seed

# Production
DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" npx prisma migrate deploy
DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" npx prisma db seed
```

### Verify (either method)

- [ ] Plans seeded: Free, Pro, Pro+
- [ ] AI Model Registry populated
- [ ] PlatformConfig defaults set

You can verify with `npx prisma studio` (set DATABASE_URL first).

---

## Phase 5: Clerk Auth

**Before starting:** Create the secrets files you'll fill in during Phases 5-8:

```bash
cp scripts/templates/secrets-staging.env.template secrets-staging.env
cp scripts/templates/secrets-production.env.template secrets-production.env
```

### 5a: Staging (Development Instance)

Your Clerk dev instance is created automatically with your account.

- [ ] Log into https://dashboard.clerk.com
- [ ] In the dev instance, enable **Email address** sign-in
- [ ] Enable **Google** social sign-in (dev uses Clerk's shared Google credentials — no setup needed)

**Collect keys** (the same publishable key is used in two places with different names):
- [ ] Go to the **API Keys** page
- [ ] Copy **Publishable Key** (`pk_test_...`):
  - Paste into `secrets-staging.env` as `CLERK_PUBLISHABLE_KEY` (Cloudflare Worker secret — used server-side)
  - Also note it for Phase 8: you'll add it as GitHub secret `VITE_CLERK_PUBLISHABLE_KEY_STAGING` (used by Vite to build the frontend)
  - **Same value, two different names** — the Worker needs it as `CLERK_PUBLISHABLE_KEY`, the frontend build needs it as `VITE_CLERK_PUBLISHABLE_KEY`
- [ ] Copy **Secret Key** (`sk_test_...`) → paste into `secrets-staging.env` as `CLERK_SECRET_KEY`

**Webhook setup happens in Phase 10** (needs the `workers.dev` URL from first deploy).

### 5b: Production (Production Instance)

- [ ] At the top of the dashboard, click the **Development** button → dropdown → **Create production instance**
- [ ] Choose to **clone development settings** or start fresh
- [ ] **Important:** SSO connections do NOT copy over — reconfigure below

**Configure Google SSO (production requires custom OAuth):**
- [ ] Go to https://console.cloud.google.com → **APIs & Services > Credentials**
- [ ] **Create Credentials > OAuth client ID** → **Web application**
- [ ] Add the authorized redirect URI shown on Clerk's **SSO connections** page
- [ ] Copy **Client ID** and **Client Secret**
- [ ] In Clerk Dashboard (production) → **SSO connections** → paste Google credentials
- [ ] Enable **Email address** sign-in

**Configure domain:**
- [ ] Go to the **Domains** page in Clerk Dashboard
- [ ] Add DNS records shown to your DNS provider (Cloudflare in this case)
- [ ] Wait for propagation (can take up to 48 hours)
- [ ] When ready, click the **Deploy certificates** button on the Dashboard homepage

**Collect keys** (same pattern as staging — publishable key used in two places):
- [ ] Go to the **API Keys** page (production instance)
- [ ] Copy **Publishable Key** (`pk_live_...`):
  - Paste into `secrets-production.env` as `CLERK_PUBLISHABLE_KEY`
  - Also note it for Phase 8: GitHub secret `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION`
- [ ] Copy **Secret Key** (`sk_live_...`) → paste into `secrets-production.env` as `CLERK_SECRET_KEY`

**Webhook setup happens in Phase 10** (needs the deployed URL).

---

## Phase 6: AI & Podcast Services

Same keys for both environments. Staging uses cheap models via PlatformConfig — same keys, different model selection.

### 6.1 Anthropic

- [ ] https://console.anthropic.com/ → **Settings > Keys** → **Create Key**
- [ ] Name: `blipp`
- [ ] Copy key (`sk-ant-...`) → paste into both `secrets-staging.env` and `secrets-production.env` as `ANTHROPIC_API_KEY`
- [ ] Add $25+ credits

### 6.2 OpenAI

- [ ] https://platform.openai.com/ → **Dashboard > API keys** → **Create new secret key**
- [ ] Name: `blipp`
- [ ] Copy key (`sk-...`) → paste into both `secrets-staging.env` and `secrets-production.env` as `OPENAI_API_KEY`
- [ ] Add $25+ credits, set spend limit in **Settings > Limits**

### 6.3 Groq (Optional)

- [ ] https://console.groq.com → **API Keys** → **Create API Key**
- [ ] Copy key (`gsk_...`) → paste into both secrets env files as `GROQ_API_KEY`

### 6.4 Deepgram (Optional)

- [ ] https://console.deepgram.com → **API Keys** → **Create Key**
- [ ] Copy key → paste into both secrets env files as `DEEPGRAM_API_KEY`

### 6.5 Podcast Index

- [ ] https://api.podcastindex.org (or check signup email)
- [ ] Copy **API Key** → paste into both secrets env files as `PODCAST_INDEX_KEY`
- [ ] Copy **API Secret** → paste into both secrets env files as `PODCAST_INDEX_SECRET`
- [ ] If the secret contains special characters (`^`, `$`, `#`), quote it when pasting

### 6.6 Cloudflare Workers AI

- [ ] No setup needed — included with Workers Paid plan via `AI` binding

---

## Phase 7: Web Push VAPID Keys

Optional but recommended. Shared between environments.

```bash
npx web-push generate-vapid-keys
```

- [ ] Copy **Public Key** → save as `VAPID_PUBLIC_KEY`
- [ ] Copy **Private Key** → save as `VAPID_PRIVATE_KEY`
- [ ] Set `VAPID_SUBJECT` to `mailto:your@email.com`

---

## Phase 8: GitHub CI/CD

**Requires:** API token from Phase 3.4, Clerk publishable keys from Phase 5.

### 8.1 Add Repository Secrets

Go to https://github.com/boosey/blipp → **Settings > Secrets and variables > Actions > New repository secret**

- [ ] `CLOUDFLARE_API_TOKEN` — the Cloudflare API token from Phase 3.4
- [ ] `VITE_CLERK_PUBLISHABLE_KEY_STAGING` — the **same `pk_test_...` value** you pasted into `secrets-staging.env` as `CLERK_PUBLISHABLE_KEY` in Phase 5a
- [ ] `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` — the **same `pk_live_...` value** you pasted into `secrets-production.env` as `CLERK_PUBLISHABLE_KEY` in Phase 5b
- [ ] `STAGING_DATABASE_URL` — Neon staging pooler connection string (from `neon-config.env`). CI uses this to run `prisma migrate deploy` before deploying.
- [ ] `PRODUCTION_DATABASE_URL` — Neon production pooler connection string (from `neon-config.env`). CI uses this to run `prisma migrate deploy` before deploying.

### 8.2 Add Repository Variable

**Settings > Secrets and variables > Actions > Variables > New repository variable**

- [ ] `STAGING_URL` — set to `placeholder` for now. Update after first deploy in Phase 10.1 when you learn the `workers.dev` URL.

### 8.3 Verify Workflows Exist

- [ ] `.github/workflows/deploy-staging.yml` — auto-deploys staging on push to `main`
- [ ] `.github/workflows/deploy-production.yml` — manual trigger (workflow_dispatch)

---

## Phase 9: Set Cloudflare Secrets

**Requires:** All keys from Phases 5-8.

Secrets are set separately per environment. Some secrets use `placeholder` initially:
- **Webhook signing secrets** (`CLERK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`) — updated in Phase 12 after creating webhook endpoints
- **Stripe secret keys** (`STRIPE_SECRET_KEY`) — set in Phase 12.6 after both environments are deployed. Use `placeholder` for now.

### Automated

```bash
# 1. Copy templates
cp scripts/templates/secrets-staging.env.template secrets-staging.env
cp scripts/templates/secrets-production.env.template secrets-production.env

# 2. Edit both files — fill in all keys from Phases 5-8
#    Set CLERK_WEBHOOK_SECRET=placeholder and STRIPE_WEBHOOK_SECRET=placeholder
#    (you'll update these after Phase 13)

# 3. Push secrets
bash scripts/set-secrets.sh secrets-staging.env staging
bash scripts/set-secrets.sh secrets-production.env production

# 4. DELETE THE FILES
rm secrets-staging.env secrets-production.env
```

### Manual Alternative

```bash
# ── Staging (no flag) ──
npx wrangler secret put CLERK_SECRET_KEY           # sk_test_...
npx wrangler secret put CLERK_PUBLISHABLE_KEY      # pk_test_...
npx wrangler secret put CLERK_WEBHOOK_SECRET       # placeholder (updated in Phase 13)
npx wrangler secret put STRIPE_SECRET_KEY          # sk_test_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # placeholder (updated in Phase 13)
npx wrangler secret put ANTHROPIC_API_KEY          # sk-ant-...
npx wrangler secret put OPENAI_API_KEY             # sk-...
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET

# ── Production (--env production) ──
npx wrangler secret put CLERK_SECRET_KEY --env production           # sk_live_...
npx wrangler secret put CLERK_PUBLISHABLE_KEY --env production      # pk_live_...
npx wrangler secret put CLERK_WEBHOOK_SECRET --env production       # placeholder (updated in Phase 13)
npx wrangler secret put STRIPE_SECRET_KEY --env production          # sk_live_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production      # placeholder (updated in Phase 13)
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put OPENAI_API_KEY --env production
npx wrangler secret put PODCAST_INDEX_KEY --env production
npx wrangler secret put PODCAST_INDEX_SECRET --env production
```

**Optional secrets (both environments):**
```bash
# Fallback STT / LLM providers
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GROQ_API_KEY --env production
npx wrangler secret put DEEPGRAM_API_KEY
npx wrangler secret put DEEPGRAM_API_KEY --env production

# Web push
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PUBLIC_KEY --env production
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PRIVATE_KEY --env production
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put VAPID_SUBJECT --env production

# Admin UI infra tooling (admin-only — UI degrades gracefully if missing)
npx wrangler secret put CF_API_TOKEN                 # Workers Observability scope
npx wrangler secret put CF_API_TOKEN --env production
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put CF_ACCOUNT_ID --env production
npx wrangler secret put NEON_API_KEY                 # backup verification
npx wrangler secret put NEON_API_KEY --env production
npx wrangler secret put NEON_PROJECT_ID
npx wrangler secret put NEON_PROJECT_ID --env production
npx wrangler secret put GITHUB_TOKEN                 # "Refresh Apple catalog" button
npx wrangler secret put GITHUB_TOKEN --env production
```

**Service key encryption (required if using DB-stored API keys via the admin UI):**
```bash
# 64-char hex AES-256 master key. Generate: openssl rand -hex 32
# MUST remain stable — rotating invalidates every key stored in the ServiceKey table.
# Use a DIFFERENT value per environment so the two envs cannot decrypt each other.
npx wrangler secret put SERVICE_KEY_ENCRYPTION_KEY
npx wrangler secret put SERVICE_KEY_ENCRYPTION_KEY --env production
```

**ZeptoMail + RevenueCat secrets are set in Phase 11** (after you have the deployed URL and have signed up for those services).

### Wrangler Vars (NOT secrets)

`APP_ORIGIN`, `ALLOWED_ORIGINS`, and `ENVIRONMENT` are set in `wrangler.jsonc` as `vars` — not as Wrangler secrets. They are baked in at deploy time. To change them, edit `wrangler.jsonc` and redeploy.

### Checklist

**Staging core secrets:**
- [ ] `CLERK_SECRET_KEY` — set
- [ ] `CLERK_PUBLISHABLE_KEY` — set
- [ ] `CLERK_WEBHOOK_SECRET` — placeholder (updated in Phase 10)
- [ ] `STRIPE_SECRET_KEY` — placeholder (set in Phase 10.6)
- [ ] `STRIPE_WEBHOOK_SECRET` — placeholder (updated in Phase 10)
- [ ] `ANTHROPIC_API_KEY` — set
- [ ] `OPENAI_API_KEY` — set
- [ ] `PODCAST_INDEX_KEY` — set
- [ ] `PODCAST_INDEX_SECRET` — set
- [ ] `SERVICE_KEY_ENCRYPTION_KEY` — set (required for admin UI service-key management)

**Production core secrets:** same 10 with `--env production`.

**Launch-phase secrets** (Phase 11): `ZEPTOMAIL_*` (4 keys) and `REVENUECAT_*` (3 keys).

**Optional secrets** (admin UI features degrade gracefully if missing): `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `VAPID_*`.

> Full authoritative list: `worker/types.ts` (type `Env`) and the [All Worker Secrets](#all-worker-secrets) quick-reference at the end of this doc.

---

## Phase 10: Deploy, Stripe & Webhooks

**Requires:** All prior phases complete. Secrets set (with placeholder webhook secrets).

This phase has a specific order: deploy → get URL → create webhooks → update secrets.

### 10.1 Deploy Staging

```bash
npx prisma generate
npm run typecheck
npm test
npx wrangler deploy
```

- [ ] Deploy succeeded
- [ ] **Write down the `workers.dev` URL** (e.g., `https://blipp-staging.XXXXXX.workers.dev`)
- [ ] Update the `STAGING_URL` GitHub variable (Phase 8.2) with this URL

### 10.2 Create Staging Webhook Endpoints

Now that you have the `workers.dev` URL:

**Clerk (Development instance):**
- [ ] Dashboard → **Webhooks** → **Add Endpoint**
- [ ] URL: `https://blipp-staging.XXXXXX.workers.dev/api/webhooks/clerk`
- [ ] Events: `user.created`, `user.updated`, `user.deleted` → **Create**
- [ ] Copy the **Signing Secret** (click eye icon)

**Stripe (Sandbox):**
- [ ] Dashboard (in sandbox) → **Webhooks** → **Create an event destination**
- [ ] Type: **Webhook endpoint**
- [ ] URL: `https://blipp-staging.XXXXXX.workers.dev/api/webhooks/stripe`
- [ ] Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → **Add endpoint**
- [ ] Expand **Signing secret** → copy it

### 10.3 Update Staging Webhook Secrets

Replace the placeholders with real signing secrets:

```bash
npx wrangler secret put CLERK_WEBHOOK_SECRET       # paste Clerk signing secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # paste Stripe signing secret
```

No redeploy needed — secrets take effect immediately.

### 10.4 Verify Staging

- [ ] Homepage loads at the `workers.dev` URL
- [ ] Sign up / sign in works (Clerk dev instance)
- [ ] `/api/me` returns user data
- [ ] Sign up creates a user via webhook (check Clerk dashboard → Webhooks → delivery attempts)

**Mark yourself as admin in staging database:**
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
```

- [ ] Admin panel accessible at `/admin`

### 10.5 Deploy Production

```bash
npx wrangler deploy --env production
```

- [ ] Deploy succeeded
- [ ] Custom domain `podblipp.com` is configured automatically via `routes` in `wrangler.jsonc`

### 10.6 Stripe Setup

Now that both environments are deployed, set up Stripe billing.

> Stripe uses **Sandboxes** (not "Test mode"). Access via the **account picker** (top-left of dashboard).

**Staging (Sandbox):**
- [ ] Log into https://dashboard.stripe.com
- [ ] Use the **account picker** to select or create a sandbox
- [ ] **Developers Dashboard > API keys** tab → Copy **Secret Key** (`sk_test_...`)
- [ ] Set the secret: `npx wrangler secret put STRIPE_SECRET_KEY` → paste the key
- [ ] Create products:
  ```bash
  DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" \
  STRIPE_SECRET_KEY="sk_test_..." \
  npx tsx scripts/setup-stripe.ts
  ```
- [ ] Products created in sandbox, staging Plan records updated

**Production (Live Mode):**
- [ ] Go to https://dashboard.stripe.com/account/onboarding
- [ ] Complete the **account application** (business details, bank account, website URL `https://podblipp.com`)
- [ ] Once approved, use the **account picker** to exit sandbox into live mode
- [ ] **Note:** Account country cannot be changed after activation
- [ ] **Developers Dashboard > API keys** tab (in live mode) → Copy **Secret Key** (`sk_live_...`)
- [ ] Set the secret: `npx wrangler secret put STRIPE_SECRET_KEY --env production` → paste the key
- [ ] Create products:
  ```bash
  DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" \
  STRIPE_SECRET_KEY="sk_live_..." \
  npx tsx scripts/setup-stripe.ts
  ```
- [ ] Products created in live mode, production Plan records updated

**Configure customer portal (live mode):**
- [ ] **Settings > Billing > Portal** (URL: `dashboard.stripe.com/settings/billing/portal`)
- [ ] Allow: cancellations, plan switching, payment method updates
- [ ] Customize branding in **Settings > Branding**

### 10.7 Create Production Webhook Endpoints

**Clerk (Production instance):**
- [ ] Dashboard (switch to production instance) → **Webhooks** → **Add Endpoint**
- [ ] URL: `https://podblipp.com/api/webhooks/clerk`
- [ ] Events: `user.created`, `user.updated`, `user.deleted` → **Create**
- [ ] Copy the **Signing Secret**

**Stripe (Live mode):**
- [ ] Dashboard (switch to live mode via account picker) → **Webhooks** → **Create an event destination**
- [ ] Type: **Webhook endpoint**
- [ ] URL: `https://podblipp.com/api/webhooks/stripe`
- [ ] Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → **Add endpoint**
- [ ] Expand **Signing secret** → copy it

### 10.8 Update Production Webhook Secrets

```bash
npx wrangler secret put CLERK_WEBHOOK_SECRET --env production    # paste Clerk signing secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production   # paste Stripe signing secret
```

### 10.9 Verify Production

- [ ] Homepage loads at `podblipp.com`
- [ ] Sign up / sign in works (Clerk production instance)
- [ ] `/api/me` returns user data

**Mark yourself as admin in production database:**
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
```

- [ ] Admin panel accessible at `/admin`

### 10.10 Configure Staging PlatformConfig

Set staging to use cheapest AI models (via admin UI at `workers.dev` URL → `/admin`):

- [ ] STT model → Whisper Large v3 Turbo on Cloudflare
- [ ] Distillation model → Haiku 4.5 on Anthropic
- [ ] Narrative model → Haiku 4.5 on Anthropic
- [ ] TTS model → MeloTTS on Cloudflare

---

## Phase 11: Transactional Email (ZeptoMail) & RevenueCat

These services back two shipping features: the welcome email sent on Clerk `user.created`, and the iOS IAP entitlement flow. Both require accounts, API credentials, and domain verification before the Worker's code paths will succeed.

### 11.1 Zoho Mail — Mailboxes (not an API integration)

Zoho Mail hosts the human-readable inboxes on `podblipp.com`. The Worker does not talk to Zoho Mail; this is for you and your customers.

- [ ] Sign up at https://www.zoho.com/mail and add `podblipp.com` as a custom domain
- [ ] Add the DNS records Zoho shows (MX + SPF + DKIM + domain verification) in Cloudflare DNS
- [ ] Wait for verification to complete (usually <30 min)
- [ ] Create mailboxes, at minimum:
  - [ ] `welcome@podblipp.com` — transactional sender identity (also used by ZeptoMail)
  - [ ] `support@podblipp.com` — customer replies
  - [ ] `boose@podblipp.com` — founder inbox
- [ ] Record each mailbox credential in the password manager (one vault entry per mailbox)

### 11.2 ZeptoMail — Transactional Welcome Email

The `WELCOME_EMAIL_QUEUE` consumer (`worker/queues/welcome-email.ts`) sends one email per new Clerk user via ZeptoMail's Send Mail API. ZeptoMail is Zoho's transactional product — separate from Zoho Mail, separate account needed.

**Sign up and verify domain:**
- [ ] https://www.zoho.com/zeptomail → sign up (same Zoho login as Zoho Mail works)
- [ ] **Mail Agents → Add Mail Agent** → name it `Blipp` → domain `podblipp.com`
- [ ] Add the DKIM + SPF records ZeptoMail shows in Cloudflare DNS
- [ ] Wait for domain verification (usually <1 hr)
- [ ] **Domains → Verify sender address** → verify `welcome@podblipp.com`

**Create the welcome email template:**
- [ ] **Email Templates → Create Template** → design the welcome email in the visual editor
- [ ] Copy the **Template Key** (looks like `2d6f.xxxxxxxx.k1.xxxxxxxx.xxxxxxxx`)

**Get the API token:**
- [ ] **Setup → Mail Agents → <your agent> → API** tab → copy the **Send Mail Token**
- [ ] Strip the `Zoho-enczapikey ` prefix — only paste the token itself into the secret

**Set Worker secrets (both environments):**
```bash
npx wrangler secret put ZEPTOMAIL_TOKEN                  # the bare token, no prefix
npx wrangler secret put ZEPTOMAIL_TOKEN --env production
npx wrangler secret put ZEPTOMAIL_FROM_ADDRESS           # welcome@podblipp.com
npx wrangler secret put ZEPTOMAIL_FROM_ADDRESS --env production
npx wrangler secret put ZEPTOMAIL_FROM_NAME              # Blipp
npx wrangler secret put ZEPTOMAIL_FROM_NAME --env production
npx wrangler secret put ZEPTOMAIL_WELCOME_TEMPLATE_KEY   # template key from above
npx wrangler secret put ZEPTOMAIL_WELCOME_TEMPLATE_KEY --env production
```

**Verify:**
- [ ] Sign up a new user in staging → confirm welcome email arrives within ~1 min
- [ ] Check `welcome-email-staging` queue depth stays at 0 (no retries pile up)
- [ ] ZeptoMail dashboard → **Reports** shows the delivery

### 11.3 RevenueCat — iOS IAP

Subscriptions on iOS flow through App Store → RevenueCat → our Worker (`/api/webhooks/revenuecat`). Web/desktop subscriptions still go through Stripe directly.

- [ ] Sign up at https://app.revenuecat.com
- [ ] Create a project and add an **iOS app** with bundle ID `com.blipp.app`
- [ ] Upload the App Store Connect in-app purchase shared secret (see `ios-testflight.md`)
- [ ] Create entitlements that match the Stripe plan tiers (Pro, Pro+)
- [ ] **Integrations → Webhooks** → add endpoint: `https://podblipp.com/api/webhooks/revenuecat`
  - Authorization header: pick a long random string — this becomes `REVENUECAT_WEBHOOK_SECRET`
  - Events: all subscription lifecycle events
- [ ] **API Keys → Secret Key (v2)** → copy the `sk_...` value → `REVENUECAT_REST_API_KEY`
- [ ] **Project settings** → copy **Project ID** (`proj_...`) → `REVENUECAT_PROJECT_ID`

**Set Worker secrets (both environments):**
```bash
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET --env production
npx wrangler secret put REVENUECAT_REST_API_KEY
npx wrangler secret put REVENUECAT_REST_API_KEY --env production
npx wrangler secret put REVENUECAT_PROJECT_ID
npx wrangler secret put REVENUECAT_PROJECT_ID --env production
```

See also: `docs/guides/revenuecat-setup.md` for the deep dive on entitlements, App Store Connect pairing, and sandbox testing.

---

## Phase 12: Post-Deploy Verification

### Staging Smoke Tests

- [ ] Homepage loads
- [ ] Sign up / sign in works
- [ ] Admin panel accessible
- [ ] Podcast catalog visible in Discover
- [ ] Can subscribe to a podcast
- [ ] Pipeline runs (request a briefing → watch in admin)
- [ ] Audio plays in feed
- [ ] Billing checkout redirects to Stripe sandbox

### Production Smoke Tests

- [ ] Homepage loads at `podblipp.com`
- [ ] Sign up / sign in works
- [ ] Admin panel accessible
- [ ] Podcast catalog visible
- [ ] Pipeline runs end-to-end
- [ ] Audio plays
- [ ] Billing checkout redirects to Stripe live

### Webhook Tests

- [ ] **Clerk**: Change profile name in dashboard → verify DB updates (both environments)
- [ ] **Stripe**: Send test webhook via CLI:
  ```bash
  stripe trigger checkout.session.completed --api-key sk_test_...
  ```

### Cron (Both Environments)

- [ ] **Workers & Pages > blipp > Triggers > Cron** shows `*/5 * * * *` (production)
- [ ] **Workers & Pages > blipp-staging > Triggers > Cron** shows `*/5 * * * *` (staging — now runs cron too)
- [ ] Admin UI → Cron Jobs → every enabled job has a `lastRunAt` within its configured interval

Each Cloudflare cron tick (5 min) calls the `scheduled` handler in `worker/queues/index.ts`, which dispatches every row in the `CronJob` table whose `enabled=true` and whose `intervalMinutes` has elapsed. To pause a job without redeploying, flip `CronJob.enabled` via the admin UI. See the [Cron Jobs Reference](#cron-jobs-reference) for the full job list.

---

## Operational Runbook

Most daily/weekly checks have been automated into cron jobs (see [Cron Jobs Reference](#cron-jobs-reference)). The items below are what a human still needs to watch.

### Daily (Production)

| Task | How |
|------|-----|
| Pipeline health | Admin UI → Pipeline — stuck jobs (IN_PROGRESS > 1hr) |
| Cron job health | Admin UI → Cron Jobs — any job FAILED on last run, or missing its interval |
| Error rates | Admin UI → AI Errors — spikes = API issues |
| AI spend | Anthropic/OpenAI dashboards — or Admin UI → Service Keys → Usage |
| Welcome email health | Admin UI → Queues → `welcome-email` depth should stay at 0 |
| New signups | Clerk dashboard → Users (sanity check vs. GA4) |

### Weekly

| Task | How |
|------|-----|
| Stripe | dashboard.stripe.com — failed payments, disputes |
| RevenueCat | app.revenuecat.com → Overview — refund spikes, churn |
| Neon DB size | console.neon.com → Project overview (admin backup verification job also logs this) |
| R2 storage | Cloudflare dashboard → R2 |
| Clerk users | Clerk dashboard → Users |
| GitHub Actions | Repo → Actions tab — any recurring deploy failures |
| Queue depth | Cloudflare dashboard → Queues — especially `dead-letter` |
| ZeptoMail reputation | ZeptoMail dashboard → Reports → bounce / spam rates |
| GA4 / Google Ads | analytics.google.com + ads.google.com — top-line funnel |
| App Store Connect | TestFlight crashes, reviews (if iOS build is live) |

### Monthly

| Task | How |
|------|-----|
| Rotate API keys | Admin UI → Service Keys → Rotate (for DB-stored keys) or `wrangler secret put` |
| AI model costs | Admin UI → Model Registry + Service Keys → Usage |
| Dependencies | `npm outdated` + `npm update` |
| Clean pipeline data | `npm run clean:pipeline` |
| Backup verification | Neon console → Restore — validates PITR still works |
| Secret hygiene | Confirm no secret files left on disk; confirm vault entries have current rotation dates |

### Staging-Specific

| Task | When |
|------|------|
| Reset staging DB | After schema changes: `prisma migrate deploy` + `prisma db seed` with staging URL |
| Check AI costs | Monthly — should be minimal (cheapest models) |
| Cron parity with prod | Staging runs the same `*/5 * * * *` cron; use it to shake out new jobs before they hit prod |

### Incident Response

**Pipeline stuck:**
1. Admin UI → Pipeline → check error messages
2. AI service status pages (status.anthropic.com, status.openai.com)
3. Worker logs: `npx wrangler tail` (staging) or `npx wrangler tail --env production`
4. Cloudflare Queues for dead letters
5. Rate-limited → pause pipeline via admin config

**Auth broken:** Check Clerk status → Webhooks delivery → Worker logs → verify keys match environment

**Billing broken:** Stripe webhook delivery → verify webhook secret → Worker logs → manually fix plans in Prisma Studio

**DB connection errors:** Neon status (neonstatus.com) → `npx wrangler hyperdrive list` → connection pool limits → `npm run db:check`

**Dead letter queue messages appearing:**
1. CF dashboard → Queues → `dead-letter` queue depth
2. Worker logs: filter for `dead_letter_received` — shows jobId, episodeId, source queue
3. Check the source queue's error pattern (rate limit? model down? audio issue?)
4. Fix root cause, then retry affected jobs: Admin UI → Pipeline → filter FAILED → bulk retry

**AI provider outage (all requests failing):**
1. Admin UI → AI Errors — check if errors are `transient` (rate_limit, server_error) or `permanent` (auth, quota)
2. Transient: queue retries handle it automatically (3 retries + model chain fallback)
3. Permanent (auth/quota): fix API key or billing, then Admin UI → Pipeline → bulk retry FAILED jobs
4. If one provider is down: model chain auto-falls through to secondary/tertiary — no action needed unless all fail

**Cron jobs not running:**
1. Admin UI → Cron Jobs — check last run times and status
2. Worker logs: filter for `cron_job_failed` — shows jobKey and error
3. Check if job is disabled: `cron.{jobKey}.enabled` in Platform Config
4. Check for stuck IN_PROGRESS run: runner auto-marks as FAILED after interval elapses
5. Manual trigger: CF dashboard → Workers → Triggers → trigger cron manually

**Feed refresh stalled (no new episodes):**
1. Admin UI → Pipeline → trigger feed refresh for a single podcast
2. Check `feed-refresh-retry` queue depth (messages that failed primary refresh)
3. Worker logs: filter for `feed_fetch_timeout` or `rss_parse_error`
4. Common causes: podcast RSS server down, feed URL changed, SSRF validation blocking legitimate URL
5. If widespread: check `cron.episode-refresh.lastRunAt` — cron may have stopped

**Welcome email not arriving:**
1. Admin UI → Queues → `welcome-email` — depth growing or messages stuck?
2. Worker logs: filter for `welcome_email_failed` — error payload shows ZeptoMail response
3. Common causes: ZeptoMail token expired/rotated, sender not verified, template key wrong, domain DKIM broken
4. ZeptoMail dashboard → **Reports** → check for "blocked" or "bounced" deliveries

**RevenueCat webhook failing:**
1. RevenueCat dashboard → Integrations → Webhooks → **Recent deliveries** — failure reason
2. Usually: wrong `REVENUECAT_WEBHOOK_SECRET` or endpoint URL
3. Worker logs: filter for `revenuecat_webhook_invalid` — shows rejection reason

---

## Cron Jobs Reference

Cloudflare fires the `scheduled` handler every 5 min (`*/5 * * * *` in `wrangler.jsonc`). The handler iterates every row in the `CronJob` table and runs any job whose `enabled=true` and whose `intervalMinutes` has elapsed since `lastRunAt`. To pause a job, flip `enabled` via Admin UI → Cron Jobs — no redeploy needed.

Implementations live in `worker/lib/cron/<jobKey>.ts`. The dispatcher is `worker/queues/index.ts` → `scheduled()`.

| jobKey | What it does | Owner module |
|--------|--------------|--------------|
| `apple-discovery` | Pulls Apple Podcasts catalog into the DB via the GitHub-hosted discovery workflow | `podcast-discovery.ts` |
| `podcast-index-discovery` | Pulls Podcast Index trending + categories into the catalog | `podcast-discovery.ts` |
| `episode-refresh` | Enqueues feed refreshes for due podcasts; the main heartbeat of the content pipeline | `episode-refresh.ts` |
| `monitoring` | Emits health metrics (queue depth, pipeline stuck counts) and fires cost alerts | `monitoring.ts` |
| `user-lifecycle` | Expires Pro grace periods, sweeps deleted-but-not-purged users | `user-lifecycle.ts` |
| `data-retention` | Purges old pipeline artifacts (R2 clips, stale transcripts, finished briefings past TTL) | `data-retention.ts` |
| `recommendations` | Refreshes the per-user podcast recommendations table | `recommendations.ts` |
| `listen-original-aggregation` | Rolls up per-episode "listen on original podcast" events for the admin dashboard | `listen-original-aggregation.ts` |
| `stale-job-reaper` | Marks IN_PROGRESS pipeline steps that have exceeded their expected duration as FAILED | `stale-job-reaper.ts` |
| `geo-tagging` | LLM-based geographic tagging for newly discovered podcasts | `geo-tagging.ts` |
| `catalog-pregen` | Pre-generates briefings for catalog showcase (trending podcasts) | `catalog-pregen.ts` |
| `manual-grant-expiry` | Expires admin-granted Pro entitlements at their end date | `manual-grant-expiry.ts` |

**Adding a new cron job:**
1. Implement `runMyJob(prisma, logger, env?)` in `worker/lib/cron/my-job.ts`
2. Import and register it in `worker/queues/index.ts` → `jobExecutors` map
3. Insert a `CronJob` row via Prisma or seed: `{ jobKey: "my-job", enabled: false, intervalMinutes: N }` — keep disabled initially
4. Verify the admin UI shows it under Cron Jobs, then flip `enabled=true`

**Routines that could be converted to Claude Cowork remote agents** (not yet implemented — candidates, not commitments):
- Weekly "stale PR triage" — scan open PRs, comment on ones stale >14 days
- Post-launch "review summarization" — pull App Store reviews daily, post a digest
- "Deploy health check" — 30 min after each prod deploy, run smoke tests and post pass/fail
- "Feature flag cleanup sweep" — weekly scan for gates that have been on 100% for >30 days

These are not `CronJob` rows; they'd run outside the Worker. Decide on a case-by-case basis whether the logic belongs inside the Worker (cron job) or outside (Cowork remote agent). Rule of thumb: if it needs DB writes or touches Worker state, put it in-Worker; if it's read-only analysis or communication, Cowork is fine.

---

## Automation Scripts

### Scripts

| Script | Purpose | Input |
|--------|---------|-------|
| `scripts/setup-db.sh` | Push schema + seed both databases | `neon-config.env` |
| `scripts/setup-infra.sh` | Create R2, queues, Hyperdrive, patch wrangler.jsonc | `neon-config.env` |
| `scripts/setup-stripe.ts` | Create Stripe products/prices, update Plan records | `DATABASE_URL` + `STRIPE_SECRET_KEY` env vars |
| `scripts/set-secrets.sh` | Batch-set Cloudflare Worker secrets | `secrets-*.env staging\|production` |

### Templates

| Template | Copy To | Purpose |
|----------|---------|---------|
| `scripts/templates/neon-config.env.template` | `neon-config.env` | Neon connection strings |
| `scripts/templates/secrets-staging.env.template` | `secrets-staging.env` | Staging Cloudflare secrets |
| `scripts/templates/secrets-production.env.template` | `secrets-production.env` | Production Cloudflare secrets |

### Full Setup Sequence

```bash
# 1. Database (after creating Neon project + staging DB manually)
cp scripts/templates/neon-config.env.template neon-config.env
# Edit neon-config.env with connection strings
bash scripts/setup-db.sh neon-config.env

# 2. Cloudflare infra
bash scripts/setup-infra.sh neon-config.env

# 3. Secrets
cp scripts/templates/secrets-staging.env.template secrets-staging.env
cp scripts/templates/secrets-production.env.template secrets-production.env
# Edit both with keys from Phases 5-8
bash scripts/set-secrets.sh secrets-staging.env staging
bash scripts/set-secrets.sh secrets-production.env production

# 4. Clean up credential files
rm neon-config.env secrets-staging.env secrets-production.env
```

---

## Quick Reference

### All Worker Secrets

The authoritative list is `worker/types.ts` (type `Env`). Keep this table in sync when adding new envs.

**Required (both environments):**

| Secret | Staging Value | Production Value | Source |
|--------|--------------|-----------------|--------|
| `CLERK_SECRET_KEY` | `sk_test_...` | `sk_live_...` | Clerk API Keys page |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` | Clerk API Keys page |
| `CLERK_WEBHOOK_SECRET` | Signing secret | Signing secret | Clerk Webhooks → endpoint |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` | Stripe Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Signing secret | Signing secret | Stripe Webhooks → endpoint |
| `ANTHROPIC_API_KEY` | shared | shared | Anthropic Settings → Keys |
| `OPENAI_API_KEY` | shared | shared | OpenAI Dashboard → API keys |
| `PODCAST_INDEX_KEY` | shared | shared | Signup email |
| `PODCAST_INDEX_SECRET` | shared | shared | Signup email |
| `DEEPGRAM_API_KEY` | shared | shared | Deepgram console |
| `GROQ_API_KEY` | shared | shared | Groq console |

**Launch-phase additions (both environments, set in Phase 11):**

| Secret | Purpose | Source |
|--------|---------|--------|
| `ZEPTOMAIL_TOKEN` | Welcome email API token (bare, no `Zoho-enczapikey ` prefix) | ZeptoMail → Mail Agents → API |
| `ZEPTOMAIL_FROM_ADDRESS` | Verified sender | e.g. `welcome@podblipp.com` |
| `ZEPTOMAIL_FROM_NAME` | Display name | `Blipp` |
| `ZEPTOMAIL_WELCOME_TEMPLATE_KEY` | Welcome email template | ZeptoMail → Templates |
| `REVENUECAT_WEBHOOK_SECRET` | IAP webhook auth header | RevenueCat → Webhooks |
| `REVENUECAT_REST_API_KEY` | `sk_...` v2 secret key | RevenueCat → API Keys |
| `REVENUECAT_PROJECT_ID` | `proj_...` | RevenueCat → Project settings |

**Optional — admin UI tooling (graceful degradation if missing):**

| Secret | Purpose | Source |
|--------|---------|--------|
| `SERVICE_KEY_ENCRYPTION_KEY` | AES-256 master key for DB-stored service keys | `openssl rand -hex 32` — one per env |
| `CF_API_TOKEN` | Workers Observability queries | CF → My Profile → API Tokens |
| `CF_ACCOUNT_ID` | CF account identifier | CF dashboard URL |
| `NEON_API_KEY` | Backup verification | Neon → Account → API keys |
| `NEON_PROJECT_ID` | Neon project identifier | Neon console URL |
| `GITHUB_TOKEN` | "Refresh Apple catalog" button | GitHub → Dev settings → Fine-grained PATs |
| `VAPID_PUBLIC_KEY` | Web push | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web push | same |
| `VAPID_SUBJECT` | Web push contact | `mailto:you@example.com` |

**Per-environment-only vars** (set in `wrangler.jsonc`, NOT `wrangler secret put`): `ENVIRONMENT`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `CLERK_FAPI_URL`, `CLERK_PUBLISHABLE_KEY` (also set as secret for parity), `WORKER_SCRIPT_NAME`.

### Wrangler Vars (in wrangler.jsonc)

| Var | Staging | Production |
|-----|---------|------------|
| `ENVIRONMENT` | `staging` | `production` |
| `APP_ORIGIN` | `workers.dev` URL | `https://podblipp.com` |
| `ALLOWED_ORIGINS` | `workers.dev` URL | `https://podblipp.com,https://www.podblipp.com` |

### GitHub Secrets & Variables

| Name | Type | Value |
|------|------|-------|
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token |
| `VITE_CLERK_PUBLISHABLE_KEY_STAGING` | Secret | `pk_test_...` |
| `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` | Secret | `pk_live_...` |
| `STAGING_DATABASE_URL` | Secret | Neon staging pooler connection string (for CI `prisma migrate deploy`) |
| `PRODUCTION_DATABASE_URL` | Secret | Neon production pooler connection string (for CI `prisma migrate deploy`) |
| `STAGING_URL` | Variable | `workers.dev` URL (set after first deploy) |

### Deploy Commands

```bash
npx wrangler deploy                  # Deploy to staging
npx wrangler deploy --env production # Deploy to production
npx wrangler tail                    # Stream staging logs
npx wrangler tail --env production   # Stream production logs
npx wrangler secret list             # List staging secrets
npx wrangler secret list --env production  # List production secrets
```
