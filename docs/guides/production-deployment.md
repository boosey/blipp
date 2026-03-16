# Blipp Deployment Checklist & Runbook

Print this out. Work through it top to bottom. Every step has its prerequisites met by prior steps — no jumping around.

This guide covers both **staging** and **production** environments. Staging deploys as `blipp-staging` to a `workers.dev` URL. Production deploys as `blipp` to `podblipp.com`.

---

## Table of Contents

1. [Phase 1: Accounts](#phase-1-accounts)
2. [Phase 2: Neon Database](#phase-2-neon-database)
3. [Phase 3: Cloudflare Infrastructure](#phase-3-cloudflare-infrastructure)
4. [Phase 4: Push Schema & Seed](#phase-4-push-schema--seed)
5. [Phase 5: Clerk Auth](#phase-5-clerk-auth)
6. [Phase 6: Stripe Billing](#phase-6-stripe-billing)
7. [Phase 7: AI & Podcast Services](#phase-7-ai--podcast-services)
8. [Phase 8: Web Push VAPID Keys](#phase-8-web-push-vapid-keys)
9. [Phase 9: Google AdSense (Optional)](#phase-9-google-adsense-optional)
10. [Phase 10: GitHub CI/CD](#phase-10-github-cicd)
11. [Phase 11: Domain & DNS](#phase-11-domain--dns)
12. [Phase 12: Set Cloudflare Secrets](#phase-12-set-cloudflare-secrets)
13. [Phase 13: First Deploy & Webhooks](#phase-13-first-deploy--webhooks)
14. [Phase 14: Post-Deploy Verification](#phase-14-post-deploy-verification)
15. [Operational Runbook](#operational-runbook)
16. [Automation Scripts](#automation-scripts)

---

## Phase 1: Accounts

Create accounts on all services. Collect credentials into a password manager as you go. The same accounts serve both environments.

### Required

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

### Optional

| # | Service | Sign Up | Purpose |
|---|---------|---------|---------|
| 9 | Groq | https://console.groq.com | Fast STT/LLM/TTS |
| 10 | Deepgram | https://console.deepgram.com/signup | Nova STT |
| 11 | Google Cloud | https://console.cloud.google.com | Google OAuth for Clerk prod SSO |

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

Run the setup script — it creates R2 buckets, 14 queues, 2 Hyperdrive configs, and patches `wrangler.jsonc` with the Hyperdrive IDs:

```bash
bash scripts/setup-infra.sh neon-config.env
```

- [ ] Script completed successfully
- [ ] Verify `wrangler.jsonc` has real Hyperdrive IDs (not placeholders)

### Manual Alternative

If the script fails or you prefer manual setup:

#### 3.1 Create R2 Buckets

- [ ] Sidebar → **R2** → **Create bucket** → `blipp-audio-staging`
- [ ] **Create bucket** again → `blipp-audio`

#### 3.2 Create Queues (14 total)

```bash
# Staging (7 queues)
npx wrangler queues create feed-refresh-staging
npx wrangler queues create distillation-staging
npx wrangler queues create narrative-generation-staging
npx wrangler queues create clip-generation-staging
npx wrangler queues create briefing-assembly-staging
npx wrangler queues create transcription-staging
npx wrangler queues create orchestrator-staging

# Production (7 queues)
npx wrangler queues create feed-refresh
npx wrangler queues create distillation
npx wrangler queues create narrative-generation
npx wrangler queues create clip-generation
npx wrangler queues create briefing-assembly
npx wrangler queues create transcription
npx wrangler queues create orchestrator
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
- [ ] **Save the token** — needed for GitHub in Phase 10

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
DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" npx prisma db push
DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" npx prisma db seed

# Production
DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" npx prisma db push
DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" npx prisma db seed
```

### Verify (either method)

- [ ] Plans seeded: Free, Pro, Pro+
- [ ] AI Model Registry populated
- [ ] PlatformConfig defaults set

You can verify with `npx prisma studio` (set DATABASE_URL first).

---

## Phase 5: Clerk Auth

### 5a: Staging (Development Instance)

Your Clerk dev instance is created automatically with your account.

- [ ] Log into https://dashboard.clerk.com
- [ ] In the dev instance, enable **Email address** sign-in
- [ ] Enable **Google** social sign-in (dev uses Clerk's shared Google credentials — no setup needed)

**Collect keys:**
- [ ] Go to the **API Keys** page
- [ ] Copy **Publishable Key** (`pk_test_...`) → save as `CLERK_PUBLISHABLE_KEY_STAGING`
- [ ] Copy **Secret Key** (`sk_test_...`) → save as `CLERK_SECRET_KEY_STAGING`

**Webhook setup is deferred to Phase 13** (needs the `workers.dev` URL from first deploy).

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

**Collect keys:**
- [ ] Go to the **API Keys** page (production instance)
- [ ] Copy **Publishable Key** (`pk_live_...`) → save as `CLERK_PUBLISHABLE_KEY_PRODUCTION`
- [ ] Copy **Secret Key** (`sk_live_...`) → save as `CLERK_SECRET_KEY_PRODUCTION`

**Webhook setup is deferred to Phase 13** (needs the deployed URL).

---

## Phase 6: Stripe Billing

**Requires:** Databases seeded from Phase 4 (Plan records must exist — the script reads them to create matching Stripe products).

> Stripe now uses **Sandboxes** (not "Test mode"). Sandboxes are accessed via the **account picker** (top-left of dashboard).

### 6a: Staging (Sandbox)

- [ ] Log into https://dashboard.stripe.com
- [ ] Use the **account picker** to select or create a sandbox

**Collect sandbox key:**
- [ ] **Developers Dashboard > API keys** tab → Copy **Secret Key** (`sk_test_...`)
- [ ] Save as `STRIPE_SECRET_KEY_STAGING`

**Create products and update database (automated):**

The script reads paid Plan records from the database, creates matching Stripe products and prices, and updates the Plan records with the Stripe-generated IDs:

```bash
DATABASE_URL="YOUR_STAGING_CONNECTION_STRING" \
STRIPE_SECRET_KEY="sk_test_..." \
npx tsx scripts/setup-stripe.ts
```

- [ ] Products created in Stripe sandbox (Pro, Pro+)
- [ ] Plan records updated with `stripeProductId`, `stripePriceIdMonthly`, `stripePriceIdAnnual`

**Webhook setup is deferred to Phase 13.**

### 6b: Production (Live Mode)

- [ ] Go to https://dashboard.stripe.com/account/onboarding
- [ ] Complete the **account application** (business details, bank account — KYC compliance)
- [ ] Once approved, use the **account picker** to exit sandbox into live mode
- [ ] **Note:** Account country cannot be changed after activation

**Collect live key:**
- [ ] In live mode, **Developers Dashboard > API keys** tab → Copy **Secret Key** (`sk_live_...`)
- [ ] Save as `STRIPE_SECRET_KEY_PRODUCTION`

**Create products and update database (automated):**

Same script, different keys:

```bash
DATABASE_URL="YOUR_PRODUCTION_CONNECTION_STRING" \
STRIPE_SECRET_KEY="sk_live_..." \
npx tsx scripts/setup-stripe.ts
```

- [ ] Products created in Stripe live mode
- [ ] Production Plan records updated with live Stripe IDs

**Configure customer portal:**
- [ ] **Settings > Billing > Portal** (URL: `dashboard.stripe.com/settings/billing/portal`)
- [ ] Allow: cancellations, plan switching, payment method updates
- [ ] Customize branding in **Settings > Branding**

**Webhook setup is deferred to Phase 13.**

---

## Phase 7: AI & Podcast Services

Same keys for both environments. Staging uses cheap models via PlatformConfig — same keys, different model selection.

### 7.1 Anthropic

- [ ] https://console.anthropic.com/ → **Settings > Keys** → **Create Key**
- [ ] Name: `blipp`
- [ ] Copy key (`sk-ant-...`) → save as `ANTHROPIC_API_KEY`
- [ ] Add $25+ credits

### 7.2 OpenAI

- [ ] https://platform.openai.com/ → **Dashboard > API keys** → **Create new secret key**
- [ ] Name: `blipp`
- [ ] Copy key (`sk-...`) → save as `OPENAI_API_KEY`
- [ ] Add $25+ credits, set spend limit in **Settings > Limits**

### 7.3 Groq (Optional)

- [ ] https://console.groq.com → **API Keys** → **Create API Key**
- [ ] Copy key (`gsk_...`) → save as `GROQ_API_KEY`

### 7.4 Deepgram (Optional)

- [ ] https://console.deepgram.com → **API Keys** → **Create Key**
- [ ] Copy key → save as `DEEPGRAM_API_KEY`

### 7.5 Podcast Index

- [ ] https://api.podcastindex.org (or check signup email)
- [ ] Copy **API Key** → save as `PODCAST_INDEX_KEY`
- [ ] Copy **API Secret** → save as `PODCAST_INDEX_SECRET`
- [ ] If the secret contains special characters (`^`, `$`, `#`), quote it when pasting

### 7.6 Cloudflare Workers AI

- [ ] No setup needed — included with Workers Paid plan via `AI` binding

---

## Phase 8: Web Push VAPID Keys

Optional but recommended. Shared between environments.

```bash
npx web-push generate-vapid-keys
```

- [ ] Copy **Public Key** → save as `VAPID_PUBLIC_KEY`
- [ ] Copy **Private Key** → save as `VAPID_PRIVATE_KEY`
- [ ] Set `VAPID_SUBJECT` to `mailto:your@email.com`

---

## Phase 9: Google AdSense (Optional)

Ads are disabled by default (`ads.enabled` = false in PlatformConfig). You can skip this entirely and enable later. The IMA SDK is already loaded in `index.html`.

**Background:** Google Ad Manager requires an AdSense account to sign up. AdSense requires site verification before approval. You don't need AdSense to use VAST tags from other ad servers — only if you want Google's ad network.

### If you want Google ads:

#### 9.1 Sign Up & Verify

- [ ] Sign up at https://www.google.com/adsense/
- [ ] Google gives you a publisher ID (`ca-pub-XXXXXXXXXXXXXXXX`)
- [ ] Choose a verification method:

**Option A — AdSense code snippet** (add to `index.html` `<head>`):
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
```

**Option B — Meta tag** (add to `index.html` `<head>`, lighter — no ads load):
```html
<meta name="google-adsense-account" content="ca-pub-XXXXXXXXXXXXXXXX" />
```

**Option C — ads.txt file** (add to `public/ads.txt`):
```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

- [ ] Deploy the app with your chosen verification method
- [ ] In AdSense dashboard, click **Request review**
- [ ] Wait for approval (days to weeks)

#### 9.2 Set Up Ad Manager (After Approval)

Once approved:
- [ ] Go to https://admanager.google.com/
- [ ] Create audio ad units (Preroll + Postroll, master size: **Audio**)
- [ ] Create line items with **Video and audio** ad type, **Audio** expected creative size
- [ ] Generate VAST tag URLs: **Inventory > Ad units > [your unit] > Tags**
  - VAST tags must include: `ad_type=audio`, `env=instream`, `vpmute=0`
- [ ] Configure in admin UI: set `ads.preroll.vastTagUrl` and `ads.postroll.vastTagUrl` in PlatformConfig
- [ ] Enable ads: set `ads.enabled` to `true` in PlatformConfig

### If you want to skip ads:

- [ ] No action needed — ads are disabled by default

---

## Phase 10: GitHub CI/CD

**Requires:** API token from Phase 3.4, Clerk publishable keys from Phase 5.

### 10.1 Add Repository Secrets

Go to https://github.com/boosey/blipp → **Settings > Secrets and variables > Actions > New repository secret**

- [ ] `CLOUDFLARE_API_TOKEN` — from Phase 3.4
- [ ] `VITE_CLERK_PUBLISHABLE_KEY_STAGING` — `pk_test_...` from Phase 5a
- [ ] `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` — `pk_live_...` from Phase 5b

### 10.2 Add Repository Variable

**Settings > Secrets and variables > Actions > Variables > New repository variable**

- [ ] `STAGING_URL` — set to `placeholder` for now. Update after first deploy in Phase 13 when you learn the `workers.dev` URL.

### 10.3 Verify Workflows Exist

- [ ] `.github/workflows/deploy-staging.yml` — auto-deploys staging on push to `main`
- [ ] `.github/workflows/deploy-production.yml` — manual trigger (workflow_dispatch)

---

## Phase 11: Domain & DNS

Only production gets a custom domain. Staging uses the `workers.dev` URL.

`podblipp.com` was purchased through Cloudflare, so DNS is already on Cloudflare.

### 11.1 Add Custom Domain to Production Worker

After the first production deploy (Phase 13), add the custom domain:

**Via dashboard:**
- [ ] **Workers & Pages > blipp > Settings > Domains & Routes**
- [ ] **Add custom domain**: `podblipp.com`
- [ ] Add `www.podblipp.com` if desired
- [ ] SSL is provisioned immediately (DNS is on Cloudflare)

**Or via wrangler.jsonc** — add `routes` inside `env.production`:
```jsonc
"routes": [
  { "pattern": "podblipp.com", "custom_domain": true },
  { "pattern": "www.podblipp.com", "custom_domain": true }
]
```

---

## Phase 12: Set Cloudflare Secrets

**Requires:** All keys from Phases 5-8.

Secrets are set separately per environment. Webhook signing secrets are NOT available yet — they come from Phase 13 after creating webhook endpoints. Use `placeholder` for now.

### Automated

```bash
# 1. Copy templates
cp scripts/templates/secrets-staging.env.template secrets-staging.env
cp scripts/templates/secrets-production.env.template secrets-production.env

# 2. Edit both files — fill in all keys from Phases 5-8
#    Set CLERK_WEBHOOK_SECRET=placeholder and STRIPE_WEBHOOK_SECRET=placeholder
#    (you'll update these after Phase 13)

# 3. Push secrets
bash scripts/set-secrets.sh secrets-staging.env
bash scripts/set-secrets.sh secrets-production.env --env production

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
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GROQ_API_KEY --env production
npx wrangler secret put DEEPGRAM_API_KEY
npx wrangler secret put DEEPGRAM_API_KEY --env production
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PUBLIC_KEY --env production
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PRIVATE_KEY --env production
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put VAPID_SUBJECT --env production
```

### Wrangler Vars (NOT secrets)

`APP_ORIGIN`, `ALLOWED_ORIGINS`, and `ENVIRONMENT` are set in `wrangler.jsonc` as `vars` — not as Wrangler secrets. They are baked in at deploy time. To change them, edit `wrangler.jsonc` and redeploy.

### Checklist

**Staging:**
- [ ] `CLERK_SECRET_KEY` — set
- [ ] `CLERK_PUBLISHABLE_KEY` — set
- [ ] `CLERK_WEBHOOK_SECRET` — placeholder (update in Phase 13)
- [ ] `STRIPE_SECRET_KEY` — set
- [ ] `STRIPE_WEBHOOK_SECRET` — placeholder (update in Phase 13)
- [ ] `ANTHROPIC_API_KEY` — set
- [ ] `OPENAI_API_KEY` — set
- [ ] `PODCAST_INDEX_KEY` — set
- [ ] `PODCAST_INDEX_SECRET` — set

**Production:**
- [ ] Same 9 secrets with `--env production`

---

## Phase 13: First Deploy & Webhooks

**Requires:** All prior phases complete. Secrets set (with placeholder webhook secrets).

This phase has a specific order: deploy → get URL → create webhooks → update secrets.

### 13.1 Deploy Staging

```bash
npx prisma generate
npm run typecheck
npm test
npx wrangler deploy
```

- [ ] Deploy succeeded
- [ ] **Write down the `workers.dev` URL** (e.g., `https://blipp-staging.XXXXXX.workers.dev`)
- [ ] Update the `STAGING_URL` GitHub variable (Phase 10.2) with this URL

### 13.2 Create Staging Webhook Endpoints

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

### 13.3 Update Staging Webhook Secrets

Replace the placeholders with real signing secrets:

```bash
npx wrangler secret put CLERK_WEBHOOK_SECRET       # paste Clerk signing secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # paste Stripe signing secret
```

No redeploy needed — secrets take effect immediately.

### 13.4 Verify Staging

- [ ] Homepage loads at the `workers.dev` URL
- [ ] Sign up / sign in works (Clerk dev instance)
- [ ] `/api/me` returns user data
- [ ] Sign up creates a user via webhook (check Clerk dashboard → Webhooks → delivery attempts)

**Mark yourself as admin in staging database:**
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
```

- [ ] Admin panel accessible at `/admin`

### 13.5 Deploy Production

```bash
npx wrangler deploy --env production
```

- [ ] Deploy succeeded
- [ ] Set up custom domain (Phase 11) if not already done

### 13.6 Create Production Webhook Endpoints

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

### 13.7 Update Production Webhook Secrets

```bash
npx wrangler secret put CLERK_WEBHOOK_SECRET --env production    # paste Clerk signing secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production   # paste Stripe signing secret
```

### 13.8 Verify Production

- [ ] Homepage loads at `podblipp.com`
- [ ] Sign up / sign in works (Clerk production instance)
- [ ] `/api/me` returns user data

**Mark yourself as admin in production database:**
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
```

- [ ] Admin panel accessible at `/admin`

### 13.9 Configure Staging PlatformConfig

Set staging to use cheapest AI models (via admin UI at `workers.dev` URL → `/admin`):

- [ ] STT model → Whisper Large v3 Turbo on Cloudflare
- [ ] Distillation model → Haiku 4.5 on Anthropic
- [ ] Narrative model → Haiku 4.5 on Anthropic
- [ ] TTS model → MeloTTS on Cloudflare

---

## Phase 14: Post-Deploy Verification

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

### Cron (Production Only)

- [ ] **Workers & Pages > blipp > Triggers > Cron** shows `*/30 * * * *`
- [ ] Staging has NO cron — trigger pipeline manually via admin

---

## Operational Runbook

### Daily (Production)

| Task | How |
|------|-----|
| Pipeline health | Admin UI → Pipeline — stuck jobs (IN_PROGRESS > 1hr) |
| Error rates | Admin UI → AI Errors — spikes = API issues |
| AI spend | Anthropic/OpenAI dashboards |
| Cron ran | Admin UI → Platform Config → `pipeline.lastAutoRunAt` |

### Weekly

| Task | How |
|------|-----|
| Stripe | dashboard.stripe.com — failed payments, disputes |
| Neon DB size | console.neon.com → Project overview |
| R2 storage | Cloudflare dashboard → R2 |
| Clerk users | Clerk dashboard → Users |
| GitHub Actions | Repo → Actions tab |
| Queue depth | Cloudflare dashboard → Queues |

### Monthly

| Task | How |
|------|-----|
| Rotate API keys | Create new → update secret → delete old |
| AI model costs | Admin UI → Model Registry |
| Dependencies | `npm outdated` + `npm update` |
| Clean pipeline data | `npm run clean:pipeline` |
| Backup verification | Neon console → Restore |

### Staging-Specific

| Task | When |
|------|------|
| Reset staging DB | After schema changes: `prisma db push` + `prisma db seed` with staging URL |
| Trigger pipeline | Manually via admin UI (no cron) |
| Check AI costs | Monthly — should be minimal (cheapest models) |

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

---

## Automation Scripts

### Scripts

| Script | Purpose | Input |
|--------|---------|-------|
| `scripts/setup-db.sh` | Push schema + seed both databases | `neon-config.env` |
| `scripts/setup-infra.sh` | Create R2, queues, Hyperdrive, patch wrangler.jsonc | `neon-config.env` |
| `scripts/setup-stripe.ts` | Create Stripe products/prices, update Plan records | `DATABASE_URL` + `STRIPE_SECRET_KEY` env vars |
| `scripts/set-secrets.sh` | Batch-set Cloudflare Worker secrets | `secrets-*.env [--env production]` |

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
bash scripts/set-secrets.sh secrets-staging.env
bash scripts/set-secrets.sh secrets-production.env --env production

# 4. Clean up credential files
rm neon-config.env secrets-staging.env secrets-production.env
```

---

## Quick Reference

### All Secrets

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
| `GROQ_API_KEY` | shared (optional) | shared (optional) | Groq console |
| `DEEPGRAM_API_KEY` | shared (optional) | shared (optional) | Deepgram console |
| `VAPID_PUBLIC_KEY` | shared (optional) | shared (optional) | Generated locally |
| `VAPID_PRIVATE_KEY` | shared (optional) | shared (optional) | Generated locally |
| `VAPID_SUBJECT` | shared (optional) | shared (optional) | `mailto:you@example.com` |

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
