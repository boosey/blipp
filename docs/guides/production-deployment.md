# Blipp Deployment Checklist & Runbook

Print this out. Work through it top to bottom. Check each box as you go.

This guide covers both **staging** and **production** environments. Staging deploys as `blipp-staging` to a `workers.dev` URL. Production deploys as `blipp` to `podblipp.com`.

---

## Table of Contents

1. [Phase 1: Accounts & API Keys](#phase-1-accounts--api-keys)
2. [Phase 2: Cloudflare Infrastructure](#phase-2-cloudflare-infrastructure)
3. [Phase 3: Database (Neon)](#phase-3-database-neon)
4. [Phase 4: Clerk (Auth)](#phase-4-clerk-auth)
5. [Phase 5: Stripe (Billing)](#phase-5-stripe-billing)
6. [Phase 6: AI Services](#phase-6-ai-services)
7. [Phase 7: Podcast Index](#phase-7-podcast-index)
8. [Phase 8: Google Ad Manager (IMA)](#phase-8-google-ad-manager-ima)
9. [Phase 9: Web Push (VAPID)](#phase-9-web-push-vapid)
10. [Phase 10: GitHub CI/CD](#phase-10-github-cicd)
11. [Phase 11: Domain & DNS](#phase-11-domain--dns)
12. [Phase 12: Deploy Secrets to Cloudflare](#phase-12-deploy-secrets-to-cloudflare)
13. [Phase 13: First Deploy](#phase-13-first-deploy)
14. [Phase 14: Post-Deploy Verification](#phase-14-post-deploy-verification)
15. [Operational Runbook](#operational-runbook)
16. [Automation Script](#automation-script)

---

## Phase 1: Accounts & API Keys

Create accounts on all services. Collect credentials into a secure password manager (1Password, Bitwarden, etc.) as you go. **Never store production secrets in plaintext files.**

The same accounts serve both staging and production environments — you create separate instances/keys within each service, not separate accounts.

### Required Accounts

| # | Service | Sign Up URL | What You Need |
|---|---------|-------------|---------------|
| 1 | Cloudflare | https://dash.cloudflare.com/sign-up | Workers Paid plan ($5/mo) |
| 2 | Neon | https://console.neon.com/signup | Scale or Business plan recommended for production |
| 3 | Clerk | https://dashboard.clerk.com/sign-up | Dev instance (staging) + Production instance |
| 4 | Stripe | https://dashboard.stripe.com/register | Sandbox (staging) + Live mode (production, requires business verification) |
| 5 | Anthropic | https://console.anthropic.com/ | API credits ($25+ recommended) |
| 6 | OpenAI | https://platform.openai.com/ | API credits ($25+ recommended) |
| 7 | Podcast Index | https://api.podcastindex.org/signup | Free |
| 8 | GitHub | (you have this) | Actions enabled on repo |

### Optional Accounts (Multi-Provider AI)

| # | Service | Sign Up URL | Purpose |
|---|---------|-------------|---------|
| 9 | Groq | https://console.groq.com | Fast STT/LLM inference, Orpheus TTS |
| 10 | Deepgram | https://console.deepgram.com/signup | Nova STT models |
| 11 | AssemblyAI | https://www.assemblyai.com/app/signup | STT benchmarking |
| 12 | Google Cloud | https://console.cloud.google.com | Chirp STT (if needed) |

---

## Phase 2: Cloudflare Infrastructure

### 2.1 Upgrade to Workers Paid Plan

- [ ] Log into Cloudflare dashboard (https://dash.cloudflare.com)
- [ ] In the sidebar, go to **Workers & Pages**
- [ ] Find the plan/pricing section and upgrade to **Workers Paid** ($5/mo) — required for Queues, Cron Triggers, and higher limits

### 2.2 Create R2 Buckets (2 buckets)

- [ ] In the sidebar, go to **R2** (under Storage & Databases section)
- [ ] Click **Create bucket**
  - Bucket name: `blipp-audio-staging`
  - Region: Auto (or choose closest to your users)
- [ ] Click **Create bucket** again
  - Bucket name: `blipp-audio`
  - Region: same as staging
- [ ] Both bucket names must match `wrangler.jsonc` (`blipp-audio-staging` for default, `blipp-audio` for production env)

### 2.3 Create Queues (14 queues — 7 staging + 7 production)

Best done via CLI. Run each command:

**Staging queues (with `-staging` suffix):**
```bash
npx wrangler queues create feed-refresh-staging
npx wrangler queues create distillation-staging
npx wrangler queues create narrative-generation-staging
npx wrangler queues create clip-generation-staging
npx wrangler queues create briefing-assembly-staging
npx wrangler queues create transcription-staging
npx wrangler queues create orchestrator-staging
```

**Production queues:**
```bash
npx wrangler queues create feed-refresh
npx wrangler queues create distillation
npx wrangler queues create narrative-generation
npx wrangler queues create clip-generation
npx wrangler queues create briefing-assembly
npx wrangler queues create transcription
npx wrangler queues create orchestrator
```

- [ ] All 14 queues created (7 staging + 7 production)

**AUTOMATABLE:** Queues are also auto-created by `wrangler deploy` if they don't exist. You can skip manual creation and let the first deploy handle it. A script is provided at the bottom of this doc.

### 2.4 Create Hyperdrive Configurations (2 configs)

**Requires Neon connection strings from Phase 3.** Complete Phase 3 first, then come back here.

**AUTOMATABLE:** Run `bash scripts/setup-infra.sh neon-config.env` to create R2 buckets, queues, Hyperdrive configs, and patch `wrangler.jsonc` automatically. See [Automation Scripts](#automation-scripts) for details.

**Manual alternative** (CLI):

```bash
# Staging (use pooled connection string from Phase 3)
npx wrangler hyperdrive create blipp-db-staging \
  --connection-string="postgres://USER:PASSWORD@ep-XXXX-pooler.REGION.aws.neon.tech:5432/staging?sslmode=require"

# Production
npx wrangler hyperdrive create blipp-db \
  --connection-string="postgres://USER:PASSWORD@ep-XXXX-pooler.REGION.aws.neon.tech:5432/neondb?sslmode=require"
```

- [ ] Staging Hyperdrive config created
- [ ] Production Hyperdrive config created
- [ ] **Copy both config IDs** from the CLI output (UUIDs)
- [ ] Update `wrangler.jsonc`:
  - Replace `<staging-hyperdrive-id>` with the staging config ID
  - Replace `<production-hyperdrive-id>` with the production config ID

### 2.5 Create API Token (for CI/CD)

- [ ] Go to **My Profile > API Tokens > Create Token**
- [ ] Use template: **Edit Cloudflare Workers**
- [ ] Scope: your account, all zones (or specific zone if you have podblipp.com on CF)
- [ ] **Save the token** — you'll add this as `CLOUDFLARE_API_TOKEN` in GitHub secrets

---

## Phase 3: Database (Neon)

> **Note:** Neon console is at `console.neon.com`.

### 3.1 Create Databases

Both staging and production databases live in the same Neon project.

- [ ] Log into Neon console at https://console.neon.com
- [ ] Create a new **project** named `blipp`
- [ ] The default database `neondb` will be used for **production**
- [ ] Create a second database named `blipp_staging` in the same project
  - Go to **Databases** in the sidebar
  - Click **New Database**, name it `blipp_staging`
- [ ] Region: closest to your Cloudflare Worker (e.g., `us-east-1`)
- [ ] **Copy both pooled connection strings** — pooled connections are now the default in the Connection Details widget (hostname contains `-pooler`, port 5432)
  - Production: `postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
  - Staging: `postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/blipp_staging?sslmode=require`

### 3.2 Configure Settings

- [ ] Connection pooling is **on by default** — verify in the Connection Details widget (the `-pooler` hostname is shown)
- [ ] Set autoscaling: go to **Settings > Compute** in your Project Dashboard, set min compute to 0.25 CU or higher to avoid cold starts
- [ ] Configure **point-in-time restore** window (default 1 day on paid plans, increase up to 30 days)
- [ ] Enable **IP allow list** if available — restrict to Cloudflare IPs
- [ ] Consider **protecting your main branch** to prevent accidental schema changes

### 3.3 Push Schema & Seed Data (Both Databases)

Run for **each** database:

```bash
# ── Staging ──
export DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/blipp_staging?sslmode=require"

npx prisma db push
npx prisma db seed

# ── Production ──
export DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"

npx prisma db push
npx prisma db seed

# Remove the export (don't leave URLs in your shell history)
unset DATABASE_URL
```

For each database, verify:
- [ ] Schema pushed successfully
- [ ] Plans seeded (Free, Pro, Pro+)
- [ ] AI Model Registry seeded
- [ ] PlatformConfig defaults seeded

### 3.4 Mark Your Admin User

After you sign up through each app, mark yourself as admin:

```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
```

Run this via the Neon SQL Editor (in the console sidebar) or `prisma studio` after your first login. You'll need to do this for both staging and production databases.

---

## Phase 4: Clerk (Auth)

### Phase 4a: Staging (Development Instance)

Staging uses Clerk's **development instance**. The webhook endpoint can only be created AFTER the first deploy (you need the `workers.dev` URL).

#### 4a.1 Configure Development Instance

- [ ] Log into Clerk dashboard (https://dashboard.clerk.com)
- [ ] Your development instance is created by default — use it for staging
- [ ] Enable **Email address** sign-in
- [ ] Enable **Google** social sign-in (dev instances use Clerk's shared Google credentials — no custom OAuth client needed)

#### 4a.2 Collect Keys

- [ ] Go to the **API Keys** page in the Clerk Dashboard
- [ ] **Publishable Key** (`pk_test_...`) — copy it
- [ ] **Secret Key** (`sk_test_...`) — copy it

#### 4a.3 Create Webhook Endpoint (AFTER Phase 13 — First Deploy)

You must deploy staging first to get your `workers.dev` URL, then come back here.

- [ ] In the Clerk Dashboard, go to the **Webhooks** page
- [ ] Click **Add Endpoint**
- [ ] In the **Endpoint URL** field, enter: `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/clerk`
- [ ] In **Subscribe to events**, select:
  - [ ] `user.created`
  - [ ] `user.updated`
  - [ ] `user.deleted`
- [ ] Click **Create**
- [ ] Reveal the **Signing Secret** and copy it
- [ ] Set this as `CLERK_WEBHOOK_SECRET` in staging secrets (Phase 12)

### Phase 4b: Production (Production Instance)

#### 4b.1 Create Production Instance

- [ ] In the Clerk Dashboard, click the **Development** button at the top to reveal the instance dropdown
- [ ] Select **Create production instance**
- [ ] Choose whether to **clone your development instance settings** or start fresh with Clerk defaults
- [ ] **Important:** SSO connections, integrations, and custom paths do NOT copy over for security reasons — you must reconfigure these

#### 4b.2 Configure Authentication Methods

- [ ] In the production instance, enable **Email address** sign-in
- [ ] Enable **Google** social sign-in
- [ ] For Google SSO in production: you need a **custom Google OAuth client** (dev uses Clerk's shared credentials)
  - [ ] Go to Google Cloud Console (https://console.cloud.google.com) > **APIs & Services > Credentials**
  - [ ] Click **Create Credentials > OAuth client ID**
  - [ ] Application type: **Web application**
  - [ ] Add authorized redirect URI from the Clerk Dashboard (shown on the SSO connections page)
  - [ ] Copy the **Client ID** and **Client Secret**
  - [ ] In the Clerk Dashboard, go to the **SSO connections** page and paste the Google credentials

#### 4b.3 Configure Domain & DNS

- [ ] In the Clerk Dashboard, go to the **Domains** page
- [ ] View the required DNS records and add them to your DNS provider
- [ ] DNS propagation can take up to 48 hours
- [ ] Once all requirements are met, a **Deploy certificates** button appears on the Dashboard homepage — click it to finalize

#### 4b.4 Create Webhook Endpoint

- [ ] In the Clerk Dashboard (production instance), go to the **Webhooks** page
- [ ] Click **Add Endpoint**
- [ ] In the **Endpoint URL** field, enter: `https://podblipp.com/api/webhooks/clerk`
- [ ] In **Subscribe to events**, select:
  - [ ] `user.created`
  - [ ] `user.updated`
  - [ ] `user.deleted`
- [ ] Click **Create**
- [ ] Reveal the **Signing Secret** and copy it

#### 4b.5 Collect Keys

- [ ] Go to the **API Keys** page in the Clerk Dashboard (production instance)
- [ ] **Publishable Key** (`pk_live_...`) — copy it
- [ ] **Secret Key** (`sk_live_...`) — copy it
- [ ] **Webhook Signing Secret** — from the webhook endpoint settings (step 4b.4 above)

---

## Phase 5: Stripe (Billing)

> **Note:** Stripe now uses **Sandboxes** (not "Test mode") as the default testing environment.

### Phase 5a: Staging (Sandbox)

Staging uses a Stripe **Sandbox**. The webhook endpoint can only be created AFTER the first deploy (you need the `workers.dev` URL).

#### 5a.1 Create or Use a Sandbox

- [ ] Log into Stripe dashboard (https://dashboard.stripe.com)
- [ ] Use the **account picker** (top-left of dashboard) to select or create a sandbox
- [ ] Sandboxes have their own API keys, products, and webhooks — fully isolated from live mode

#### 5a.2 Create Test Products & Prices

Inside the sandbox:

**Product 1: Pro**
- [ ] Go to **Product catalog** in the dashboard
- [ ] Click **Add product**
- [ ] Name: `Pro`
- [ ] Add a monthly price: $9.99/month (recurring)
- [ ] Add an annual price: $99.99/year (recurring)
- [ ] **Copy the Product ID** (`prod_...`) and **both Price IDs** (`price_...`)

**Product 2: Pro+**
- [ ] Click **Add product** again
- [ ] Name: `Pro+`
- [ ] Monthly price: $19.99/month (recurring)
- [ ] Annual price: $179.99/year (recurring)
- [ ] **Copy the Product ID** (`prod_...`) and **both Price IDs** (`price_...`)

#### 5a.3 Update Staging Database

Update the seeded plans in the **staging** database with sandbox Stripe IDs:

```sql
-- Pro plan
UPDATE "Plan" SET
  "stripePriceIdMonthly" = 'price_MONTHLY_ID_HERE',
  "stripePriceIdAnnual" = 'price_ANNUAL_ID_HERE',
  "stripeProductId" = 'prod_PRODUCT_ID_HERE'
WHERE slug = 'pro';

-- Pro+ plan
UPDATE "Plan" SET
  "stripePriceIdMonthly" = 'price_MONTHLY_ID_HERE',
  "stripePriceIdAnnual" = 'price_ANNUAL_ID_HERE',
  "stripeProductId" = 'prod_PRODUCT_ID_HERE'
WHERE slug = 'pro-plus';
```

#### 5a.4 Collect Sandbox Keys

- [ ] In the sandbox, go to **Developers Dashboard > API keys** tab
- [ ] **Secret Key** (`sk_test_...`) — copy it

#### 5a.5 Create Webhook Endpoint (AFTER Phase 13 — First Deploy)

You must deploy staging first to get your `workers.dev` URL, then come back here.

- [ ] In the sandbox dashboard, go to the **Webhooks** page
- [ ] Click **Create an event destination**
- [ ] Select destination type: **Webhook endpoint**
- [ ] Enter URL: `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/stripe`
- [ ] Select events to listen for:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_failed`
- [ ] Click **Add endpoint**
- [ ] Expand **Signing secret** to reveal and copy it (`whsec_...`)
- [ ] Set this as `STRIPE_WEBHOOK_SECRET` in staging secrets (Phase 12)

### Phase 5b: Production (Live Mode)

#### 5b.1 Activate Live Mode

- [ ] Go to https://dashboard.stripe.com/account/onboarding
- [ ] Complete the **account application** — Stripe requires business details (name, address, website URL, bank account) for KYC compliance
- [ ] Once approved, exit the sandbox using the **account picker** (top-left of dashboard) to access live mode
- [ ] **Note:** You cannot change the account's country after activation

#### 5b.2 Create Products & Prices

Make sure you are in **live mode** (not a sandbox) when creating products.

**Product 1: Pro**
- [ ] Go to **Product catalog** in the dashboard
- [ ] Click **Add product**
- [ ] Name: `Pro`
- [ ] Add a monthly price: $9.99/month (recurring)
- [ ] Add an annual price: $99.99/year (recurring)
- [ ] **Copy the Product ID** (`prod_...`) and **both Price IDs** (`price_...`)

**Product 2: Pro+**
- [ ] Click **Add product** again
- [ ] Name: `Pro+`
- [ ] Monthly price: $19.99/month (recurring)
- [ ] Annual price: $179.99/year (recurring)
- [ ] **Copy the Product ID** (`prod_...`) and **both Price IDs** (`price_...`)

**Tip:** If you already created products in a sandbox, you can use **Copy to live mode** on the Product catalog page.

#### 5b.3 Update Production Database

Update the seeded plans in the **production** database with live Stripe IDs:

```sql
-- Pro plan
UPDATE "Plan" SET
  "stripePriceIdMonthly" = 'price_MONTHLY_ID_HERE',
  "stripePriceIdAnnual" = 'price_ANNUAL_ID_HERE',
  "stripeProductId" = 'prod_PRODUCT_ID_HERE'
WHERE slug = 'pro';

-- Pro+ plan
UPDATE "Plan" SET
  "stripePriceIdMonthly" = 'price_MONTHLY_ID_HERE',
  "stripePriceIdAnnual" = 'price_ANNUAL_ID_HERE',
  "stripeProductId" = 'prod_PRODUCT_ID_HERE'
WHERE slug = 'pro-plus';
```

#### 5b.4 Configure Customer Portal

- [ ] Go to **Settings > Billing > Portal** (direct URL: `dashboard.stripe.com/settings/billing/portal`)
- [ ] Configure subscription management: allow cancellations, plan switching
- [ ] Configure payment method updates
- [ ] Customize portal branding (via **Settings > Branding**)

#### 5b.5 Create Webhook Endpoint

- [ ] In the live mode dashboard, go to the **Webhooks** page (via **Developers** menu at bottom-left, or search)
- [ ] Click **Create an event destination**
- [ ] Select destination type: **Webhook endpoint**
- [ ] Enter URL: `https://podblipp.com/api/webhooks/stripe`
- [ ] Select events to listen for:
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_failed`
- [ ] Click **Add endpoint**
- [ ] Expand **Signing secret** to reveal and copy it (`whsec_...`)

#### 5b.6 Collect Keys

- [ ] **Live Secret Key** (`sk_live_...`) — from the **Developers Dashboard > API keys** tab (make sure you're in live mode, not a sandbox)
- [ ] **Webhook Signing Secret** (`whsec_...`) — from the webhook endpoint's signing secret section

---

## Phase 6: AI Services

These keys are shared between staging and production (same API accounts, same keys). You may choose to create separate keys per environment for cost tracking.

### 6.1 Anthropic (Claude — Distillation & Narrative)

- [ ] Log into https://console.anthropic.com/
- [ ] Go to **Settings > Keys** (direct URL: https://console.anthropic.com/settings/keys)
- [ ] Click **Create Key**
- [ ] Name: `blipp-prod` (or create separate `blipp-staging` / `blipp-prod` keys)
- [ ] **Copy the key** (`sk-ant-...`)
- [ ] Add credits: $25+ recommended for initial testing
- [ ] Set usage limits/alerts in Settings if desired

### 6.2 OpenAI (TTS + Whisper STT)

- [ ] Log into https://platform.openai.com/
- [ ] Go to **Dashboard > API keys** (direct URL: https://platform.openai.com/api-keys)
- [ ] Click **Create new secret key**
- [ ] Name: `blipp-prod` (or create separate keys per environment)
- [ ] **Copy the key** (`sk-...`)
- [ ] Add credits: $25+ recommended
- [ ] Set monthly spend limit in **Settings > Limits**

### 6.3 Groq (Optional — Fast STT/LLM/TTS)

- [ ] Log into https://console.groq.com
- [ ] Go to **API Keys > Create API Key**
- [ ] **Copy the key** (`gsk_...`)
- [ ] Note: Groq has generous free tier, but set up billing for production volume

### 6.4 Deepgram (Optional — Nova STT)

- [ ] Log into https://console.deepgram.com
- [ ] Go to **API Keys > Create Key**
- [ ] **Copy the key**
- [ ] Add credits if needed (has free tier)

### 6.5 Cloudflare Workers AI (Included)

- [ ] No additional setup needed — the `AI` binding in `wrangler.jsonc` handles this
- [ ] Workers AI is included with Workers Paid plan
- [ ] Models like `@cf/openai/whisper-large-v3-turbo` are available automatically

---

## Phase 7: Podcast Index

Shared between staging and production.

- [ ] Log into https://api.podcastindex.org (or check email from signup)
- [ ] **Copy API Key** and **API Secret**
- [ ] Note: if the secret contains special characters (`^`, `$`, `#`), it needs quoting in some contexts

---

## Phase 8: Google AdSense / Ad Manager (IMA)

This is for client-side ad insertion via Google IMA SDK. Ads are optional — the app works without them (controlled by `ads.enabled` PlatformConfig flag, defaults to disabled).

### If you want ads:

#### 8.1 Sign Up for Google AdSense

Google Ad Manager redirects new accounts to **Google AdSense** for initial approval.

- [ ] Sign up at https://www.google.com/adsense/ (or follow redirect from Ad Manager)
- [ ] AdSense requires **site verification** before approval. Add the verification meta tag to `index.html`:

```html
<!-- Add inside <head>, before <title> -->
<meta name="google-adsense-account" content="ca-pub-XXXXXXXXXXXXXXXX" />
```

Replace `ca-pub-XXXXXXXXXXXXXXXX` with your actual AdSense publisher ID (shown during signup).

- [ ] Deploy the app with the meta tag so Google can verify your site
- [ ] Wait for AdSense approval (can take days to weeks)

#### 8.2 Set Up Ad Manager (After AdSense Approval)

Once approved, you can access **Google Ad Manager** (https://admanager.google.com/):

- [ ] Create an Ad Manager network (may be auto-created with AdSense)
- [ ] Create **ad units** for:
  - [ ] Preroll (audio ad before briefing)
  - [ ] Postroll (audio ad after briefing)
- [ ] Create **line items** and **creatives** with VAST tags
- [ ] Get your **VAST tag URLs** — these go into `PlatformConfig` via admin UI:
  - Key: `ads.preroll.vastTagUrl`
  - Key: `ads.postroll.vastTagUrl`
- [ ] The IMA SDK loads from `https://imasdk.googleapis.com/js/sdkloader/ima3.js` (already in `index.html`)
- [ ] VAST tag macros supported: `[CACHE_BUSTER]`, `[CONTENT_ID]`, `[CONTENT_CATEGORY]`, `[DURATION_TIER]`

### If you want to skip ads for now:

- [ ] No action needed — ads are disabled by default
- [ ] Enable later via admin UI: set `ads.enabled` to `true` in Platform Config
- [ ] You can add the AdSense meta tag now to start the approval process even if you're not ready to serve ads

---

## Phase 9: Web Push (VAPID)

VAPID keys are needed for browser push notifications. Optional but recommended. Shared between staging and production, or generate separate pairs.

### 9.1 Generate VAPID Keys

```bash
# Using web-push npm package (install temporarily)
npx web-push generate-vapid-keys
```

This outputs:
```
Public Key: BLxxxxxx...
Private Key: xxxxxxxx...
```

- [ ] **Copy Public Key** -> `VAPID_PUBLIC_KEY`
- [ ] **Copy Private Key** -> `VAPID_PRIVATE_KEY`
- [ ] Set `VAPID_SUBJECT` to `mailto:your@email.com`

---

## Phase 10: GitHub CI/CD

### 10.1 Add Repository Secrets

- [ ] Go to your repo: https://github.com/boosey/blipp
- [ ] **Settings > Secrets and variables > Actions > New repository secret**
- [ ] Add secrets:
  - `CLOUDFLARE_API_TOKEN` — the API token from Phase 2.5
  - `VITE_CLERK_PUBLISHABLE_KEY_STAGING` — the Clerk dev instance publishable key (`pk_test_...`)
  - `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` — the Clerk production instance publishable key (`pk_live_...`)

### 10.2 Add Repository Variable

- [ ] **Settings > Secrets and variables > Actions > Variables > New repository variable**
  - `STAGING_URL` — the `workers.dev` URL from your first staging deploy (set after Phase 13)

### 10.3 Verify Workflows

Two CI/CD workflows:

- [ ] `.github/workflows/deploy-staging.yml` — triggers automatically on push to `main`
  - Checkout -> install -> prisma generate -> typecheck -> test -> `npx wrangler deploy`
  - Uses `VITE_CLERK_PUBLISHABLE_KEY_STAGING` for the frontend build

- [ ] `.github/workflows/deploy-production.yml` — **manual trigger only** (workflow_dispatch)
  - Same steps but runs `npx wrangler deploy --env production`
  - Uses `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` for the frontend build

---

## Phase 11: Domain & DNS

Only **production** gets a custom domain. Staging uses the `workers.dev` URL.

Domain `podblipp.com` was purchased through Cloudflare, so DNS is already managed by Cloudflare.

### 11.1 Add Custom Domain to Production Worker

Since the domain is on Cloudflare, this can be done via wrangler or the dashboard:

**Via CLI (add to wrangler.jsonc):**

Add a `routes` array inside `env.production`:
```jsonc
"routes": [
  { "pattern": "podblipp.com", "custom_domain": true },
  { "pattern": "www.podblipp.com", "custom_domain": true }
]
```

**Via dashboard:**
- [ ] Go to **Workers & Pages > blipp > Settings > Domains & Routes**
- [ ] **Add custom domain**: `podblipp.com`
- [ ] Add `www.podblipp.com` if desired (and set up redirect)
- [ ] Cloudflare auto-provisions SSL (immediate since DNS is on CF)

### 11.3 CORS Origins

Origins are configured as Wrangler vars in `wrangler.jsonc` (not secrets):

- **Staging** (`APP_ORIGIN` / `ALLOWED_ORIGINS`): `https://staging.podblipp.com` (or the `workers.dev` URL)
- **Production** (`APP_ORIGIN` / `ALLOWED_ORIGINS`): `https://podblipp.com,https://www.podblipp.com`
- Dev origins (`http://localhost:8787`, `http://localhost:5173`) are hardcoded for local development

If you need to change these, update the `vars` section in `wrangler.jsonc` directly.

---

## Phase 12: Deploy Secrets to Cloudflare

Secrets must be set separately for each environment. Staging secrets use no flag. Production secrets use `--env production`.

### 12.1 Staging Secrets

```bash
# Auth (Clerk dev instance)
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put CLERK_WEBHOOK_SECRET

# Billing (Stripe sandbox)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# AI - Required
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY

# Podcast data
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET
```

**Optional staging secrets:**
```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put DEEPGRAM_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put GOOGLE_STT_API_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put NEON_API_KEY
npx wrangler secret put NEON_PROJECT_ID
```

### 12.2 Production Secrets

```bash
# Auth (Clerk production instance)
npx wrangler secret put CLERK_SECRET_KEY --env production
npx wrangler secret put CLERK_PUBLISHABLE_KEY --env production
npx wrangler secret put CLERK_WEBHOOK_SECRET --env production

# Billing (Stripe live mode)
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production

# AI - Required
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put OPENAI_API_KEY --env production

# Podcast data
npx wrangler secret put PODCAST_INDEX_KEY --env production
npx wrangler secret put PODCAST_INDEX_SECRET --env production
```

**Optional production secrets:**
```bash
npx wrangler secret put GROQ_API_KEY --env production
npx wrangler secret put DEEPGRAM_API_KEY --env production
npx wrangler secret put ASSEMBLYAI_API_KEY --env production
npx wrangler secret put GOOGLE_STT_API_KEY --env production
npx wrangler secret put VAPID_PUBLIC_KEY --env production
npx wrangler secret put VAPID_PRIVATE_KEY --env production
npx wrangler secret put VAPID_SUBJECT --env production
npx wrangler secret put NEON_API_KEY --env production
npx wrangler secret put NEON_PROJECT_ID --env production
```

### 12.3 Wrangler Vars (not secrets)

`APP_ORIGIN` and `ALLOWED_ORIGINS` are set in `wrangler.jsonc` as `vars`, not as Wrangler secrets. They are baked into the worker at deploy time. To change them, edit `wrangler.jsonc` and redeploy.

### 12.4 Secrets File Templates

Create template files for batch-setting secrets (see [Automation Script](#automation-script)):

**`secrets-staging.env`:**
```env
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PODCAST_INDEX_KEY=...
PODCAST_INDEX_SECRET=...
GROQ_API_KEY=gsk_...
DEEPGRAM_API_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

**`secrets-production.env`:**
```env
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PODCAST_INDEX_KEY=...
PODCAST_INDEX_SECRET=...
GROQ_API_KEY=gsk_...
DEEPGRAM_API_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

**DELETE these files immediately after use. Ensure they are in `.gitignore`.**

### Checklist

**Staging:**
- [ ] `CLERK_SECRET_KEY` — set
- [ ] `CLERK_PUBLISHABLE_KEY` — set
- [ ] `CLERK_WEBHOOK_SECRET` — set (after first deploy)
- [ ] `STRIPE_SECRET_KEY` — set
- [ ] `STRIPE_WEBHOOK_SECRET` — set (after first deploy)
- [ ] `ANTHROPIC_API_KEY` — set
- [ ] `OPENAI_API_KEY` — set
- [ ] `PODCAST_INDEX_KEY` — set
- [ ] `PODCAST_INDEX_SECRET` — set

**Production:**
- [ ] `CLERK_SECRET_KEY` — set
- [ ] `CLERK_PUBLISHABLE_KEY` — set
- [ ] `CLERK_WEBHOOK_SECRET` — set
- [ ] `STRIPE_SECRET_KEY` — set
- [ ] `STRIPE_WEBHOOK_SECRET` — set
- [ ] `ANTHROPIC_API_KEY` — set
- [ ] `OPENAI_API_KEY` — set
- [ ] `PODCAST_INDEX_KEY` — set
- [ ] `PODCAST_INDEX_SECRET` — set

**AUTOMATABLE:** See [Automation Script](#automation-script) at the bottom to batch-set secrets from a file.

---

## Phase 13: First Deploy

### 13.1 Update wrangler.jsonc

- [ ] Replace `<staging-hyperdrive-id>` with real staging Hyperdrive config ID from Phase 2.4
- [ ] Replace `<production-hyperdrive-id>` with real production Hyperdrive config ID from Phase 2.4

### 13.2 Deploy Staging First

Deploy staging to get the `workers.dev` URL:

```bash
npx prisma generate
npm run typecheck
npm test
npx wrangler deploy
```

- [ ] Deploy succeeded
- [ ] **Note the `workers.dev` URL** (e.g., `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev`)
- [ ] Set this as the `STAGING_URL` GitHub variable (Phase 10.2)

### 13.3 Create Webhook Endpoints (Staging)

Now that you have the `workers.dev` URL, go back and create:

- [ ] **Clerk staging webhook** (Phase 4a.3) pointing to `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/clerk`
- [ ] **Stripe staging webhook** (Phase 5a.5) pointing to `https://blipp-staging.YOUR-SUBDOMAIN.workers.dev/api/webhooks/stripe`
- [ ] Set the webhook signing secrets via `npx wrangler secret put CLERK_WEBHOOK_SECRET` and `npx wrangler secret put STRIPE_WEBHOOK_SECRET`

### 13.4 Verify Staging Works

- [ ] Homepage loads (SPA renders)
- [ ] Sign up / sign in works (Clerk dev instance)
- [ ] `/api/me` returns your user data
- [ ] Mark yourself as admin in the staging database
- [ ] Admin panel accessible at `/admin`

### 13.5 Deploy Production

```bash
npx wrangler deploy --env production
```

- [ ] Deploy succeeded
- [ ] Worker is running at `podblipp.com` (after custom domain setup in Phase 11)

### 13.6 Post-Deploy Database Setup

For each environment:
- [ ] Sign up through the app (creates your User record via Clerk webhook or auto-create)
- [ ] Mark yourself as admin:
  ```sql
  UPDATE "User" SET "isAdmin" = true WHERE email = 'your@email.com';
  ```
- [ ] Verify admin access at `/admin`

---

## Phase 14: Post-Deploy Verification

### Staging Smoke Tests

- [ ] Homepage loads (SPA renders)
- [ ] Sign up / sign in works (Clerk dev instance)
- [ ] Admin panel accessible at `/admin`
- [ ] `/api/me` returns your user data
- [ ] Podcast catalog visible in Discover
- [ ] Can subscribe to a podcast
- [ ] Pipeline runs (request a briefing, watch it progress in admin)
- [ ] Audio plays in feed
- [ ] Billing checkout redirects to Stripe sandbox

### Production Smoke Tests

- [ ] Homepage loads (SPA renders)
- [ ] Sign up / sign in works (Clerk production instance)
- [ ] Admin panel accessible at `/admin`
- [ ] `/api/me` returns your user data
- [ ] Podcast catalog visible in Discover
- [ ] Can subscribe to a podcast
- [ ] Pipeline runs (request a briefing, watch it progress in admin)
- [ ] Audio plays in feed
- [ ] Billing checkout redirects to Stripe (test with a $0 coupon or cancel before paying)

### Webhook Tests

- [ ] **Clerk**: Update your profile name in Clerk dashboard -> verify it updates in your DB (test both environments)
- [ ] **Stripe**: Use Stripe CLI or dashboard to send a test webhook -> verify it's received
  ```bash
  # Production
  stripe trigger checkout.session.completed --api-key sk_live_...
  # Sandbox
  stripe trigger checkout.session.completed --api-key sk_test_...
  ```

### Cron Verification (Production Only)

- [ ] Check **Workers & Pages > blipp > Triggers > Cron** shows `*/30 * * * *`
- [ ] Wait for a cron tick or trigger manually via admin -> verify feed refresh runs
- [ ] Staging does NOT have cron triggers — trigger pipeline manually via admin UI

### R2 Verification

- [ ] After a briefing completes, check both R2 buckets for audio files
- [ ] Verify public access works (audio URLs in briefings should be playable)

---

## Operational Runbook

### Daily Tasks (Production)

| Task | How | Notes |
|------|-----|-------|
| Check pipeline health | Admin UI -> Pipeline page | Look for stuck jobs (IN_PROGRESS > 1hr) |
| Check error rates | Admin UI -> AI Errors page | Spikes in errors = API issues or rate limits |
| Monitor AI spend | Anthropic/OpenAI dashboards | Compare daily cost to expected baseline |
| Verify cron ran | Admin UI -> Platform Config -> `pipeline.lastAutoRunAt` | Should update every 30-60 min |

### Weekly Tasks (Production)

| Task | How | Notes |
|------|-----|-------|
| Review Stripe dashboard | https://dashboard.stripe.com | Check for failed payments, disputes |
| Check Neon database size | Neon console (console.neon.com) -> Project overview | Usage-based on paid plans — monitor storage growth |
| Review R2 storage usage | Cloudflare dashboard -> R2 | Audio files accumulate — plan for cleanup |
| Check Clerk active users | Clerk dashboard -> Users | Track growth, watch for abuse |
| Review GitHub Actions | Repo -> Actions tab | Check for flaky tests or deploy failures |
| Catalog refresh | Admin UI -> Podcasts -> Catalog Refresh | Manually trigger if trending list seems stale |
| Check queue depth | Cloudflare dashboard -> Queues | Messages piling up = worker can't keep up |

### Monthly Tasks (Production)

| Task | How | Notes |
|------|-----|-------|
| Rotate API keys | All AI providers + Stripe | Create new key, update secret, delete old |
| Review AI model costs | Admin UI -> Model Registry | Prices change — compare actual vs registry |
| Database maintenance | Neon console (console.neon.com) | Check connection counts, query performance |
| Dependency updates | `npm outdated`, `npm update` | Especially security patches |
| Clean old pipeline data | `npm run clean:pipeline` | Remove completed jobs older than 30 days |
| Clean orphaned R2 objects | Manual or script | Clips for deleted episodes |
| Review audit log | Prisma Studio -> AuditLog | Spot unexpected admin actions |
| Backup verification | Neon console -> Restore | Verify point-in-time restore works (paid plans: 1-30 day window) |

### Staging-Specific Tasks

| Task | When | How |
|------|------|-----|
| Reset staging DB | After major schema changes | `npx prisma db push` + `npx prisma db seed` with staging DATABASE_URL |
| Re-seed after schema changes | After `prisma db push` | Run seed against staging database |
| Trigger pipeline manually | As needed for testing | Admin UI -> Pipeline (no cron in staging) |
| Review staging AI costs | Monthly | Should be minimal — flag if unexpectedly high |

### As-Needed Tasks

| Task | When | How |
|------|------|-----|
| Scale up Neon compute | High traffic / cold starts | Neon console -> Settings > Compute -> increase min CU |
| Add new podcast source | Users request niche podcasts | Admin UI -> approve PodcastRequests |
| Update AI model config | New models released | Admin UI -> Model Registry |
| Handle Stripe dispute | Email notification | Stripe dashboard -> Disputes |
| Re-seed plan data | Plan pricing changes | Update DB directly or re-run seed |
| Debug failed briefing | User reports | Admin UI -> Pipeline -> find job -> check steps/events |
| Worker rollback | Bad deploy | `npx wrangler rollback` or revert commit + push |

### Incident Response

**Pipeline stuck (jobs not completing):**
1. Check Admin UI -> Pipeline for error messages
2. Check AI service dashboards for outages (status.anthropic.com, status.openai.com)
3. Check Cloudflare Queues for DLQ messages
4. Check Worker logs: `npx wrangler tail` (staging) or `npx wrangler tail --env production`
5. If rate-limited: reduce batch sizes or pause pipeline via admin config

**Auth not working:**
1. Check Clerk status page
2. Verify webhook endpoint is responding: Clerk dashboard -> Webhooks -> check delivery attempts
3. Check Worker logs for auth middleware errors
4. Verify `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` are correct for the environment

**Billing issues:**
1. Check Stripe dashboard for webhook delivery failures
2. Verify Stripe webhook secret matches
3. Check Worker logs for Stripe-related errors
4. Users stuck on wrong plan: manually update in Prisma Studio

**Database connection errors:**
1. Check Neon status page (https://neonstatus.com)
2. Verify Hyperdrive config is correct (`npx wrangler hyperdrive list`)
3. Check connection pool limits (PgBouncer supports up to 10,000 concurrent connections)
4. `npm run db:check` from local with the appropriate DATABASE_URL

---

## Automation Scripts

All infrastructure setup is automated via scripts in `scripts/`. Template files for input are in `scripts/templates/`.

### Setup Order

```
1. Create Neon project + staging database (manual — console.neon.com)
2. bash scripts/setup-db.sh neon-config.env          # Push schema + seed both DBs
3. bash scripts/setup-infra.sh neon-config.env        # R2 + queues + Hyperdrive + patch wrangler.jsonc
4. bash scripts/set-secrets.sh secrets-staging.env     # Staging secrets
5. bash scripts/set-secrets.sh secrets-production.env --env production  # Production secrets
6. rm neon-config.env secrets-staging.env secrets-production.env  # DELETE credential files!
```

### Template Files

Copy templates and fill in your values:

```bash
cp scripts/templates/neon-config.env.template neon-config.env
cp scripts/templates/secrets-staging.env.template secrets-staging.env
cp scripts/templates/secrets-production.env.template secrets-production.env
```

### Script Reference

| Script | What It Does |
|--------|-------------|
| `scripts/setup-db.sh <config>` | Pushes Prisma schema + seeds both staging and production databases |
| `scripts/setup-infra.sh <config>` | Creates 2 R2 buckets, 14 queues, 2 Hyperdrive configs, patches wrangler.jsonc |
| `scripts/set-secrets.sh <file> [--env production]` | Batch-sets Cloudflare Worker secrets from an env file |

### Checklist

- [ ] Copy all 3 templates and fill in values
- [ ] Run `setup-db.sh`
- [ ] Run `setup-infra.sh`
- [ ] Run `set-secrets.sh` for staging
- [ ] Run `set-secrets.sh --env production` for production
- [ ] **DELETE all credential files immediately after**
- [ ] All credential files are covered by `.gitignore` (`.env*` pattern)

---

## Quick Reference: All Secrets Summary

| Secret | Source | Required | Per-Env |
|--------|--------|----------|---------|
| `CLERK_SECRET_KEY` | Clerk Dashboard -> API Keys page | Yes | Yes (different per env) |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard -> API Keys page | Yes | Yes (different per env) |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard -> Webhooks page -> endpoint -> Signing Secret | Yes | Yes (different per env) |
| `STRIPE_SECRET_KEY` | Stripe Developers Dashboard -> API keys tab | Yes | Yes (sandbox vs live) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhooks page -> endpoint -> Signing secret | Yes | Yes (different per env) |
| `ANTHROPIC_API_KEY` | Anthropic console -> Settings -> Keys | Yes | Optional (can share) |
| `OPENAI_API_KEY` | OpenAI platform -> Dashboard -> API keys | Yes | Optional (can share) |
| `PODCAST_INDEX_KEY` | Podcast Index signup email | Yes | No (shared) |
| `PODCAST_INDEX_SECRET` | Podcast Index signup email | Yes | No (shared) |
| `GROQ_API_KEY` | Groq console -> API Keys | No | Optional (can share) |
| `DEEPGRAM_API_KEY` | Deepgram console -> API Keys | No | Optional (can share) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI dashboard | No | Optional (can share) |
| `GOOGLE_STT_API_KEY` | Google Cloud console | No | Optional (can share) |
| `VAPID_PUBLIC_KEY` | Generated locally | No | Optional (can share) |
| `VAPID_PRIVATE_KEY` | Generated locally | No | Optional (can share) |
| `VAPID_SUBJECT` | Your email (mailto: format) | No | No (shared) |
| `NEON_API_KEY` | Neon console (console.neon.com) -> Account Settings -> API Keys | No | No (shared) |
| `NEON_PROJECT_ID` | Neon console -> Project Settings | No | No (shared) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare -> API Tokens (GitHub secret, not Worker secret) | Yes | No (shared) |

| Wrangler Var (in wrangler.jsonc, not secret) | Staging | Production |
|----------------------------------------------|---------|------------|
| `ENVIRONMENT` | `staging` | `production` |
| `APP_ORIGIN` | `https://staging.podblipp.com` | `https://podblipp.com` |
| `ALLOWED_ORIGINS` | `https://staging.podblipp.com` | `https://podblipp.com,https://www.podblipp.com` |

| GitHub Secret / Variable | Value |
|--------------------------|-------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (secret) |
| `VITE_CLERK_PUBLISHABLE_KEY_STAGING` | Clerk dev publishable key (secret) |
| `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` | Clerk prod publishable key (secret) |
| `STAGING_URL` | `workers.dev` URL from first staging deploy (variable) |
