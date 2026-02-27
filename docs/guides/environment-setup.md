# Blipp Environment Setup Guide

This guide has three self-contained parts. Start with Part 1 and work forward as needed.

| Part | Purpose | Time | When you need it |
|------|---------|------|------------------|
| [1. Local Development](#part-1-local-development) | Run the app on your machine | ~10 min | Always |
| [2. Staging on Cloudflare](#part-2-staging-on-cloudflare) | Deploy a test version | ~15 min | When you want a live URL |
| [3. Production on Cloudflare](#part-3-production-on-cloudflare) | Go live for real users | ~20 min | Launch day |

---

## Part 1: Local Development

Everything you need to run Blipp on `localhost:5173`. You'll create accounts for six services, grab API keys, and populate two files.

**What you need:** Clerk, Neon, Anthropic, OpenAI, Podcast Index accounts + keys, Stripe sandbox key

**What you DON'T need:** Cloudflare account, R2, Queues, Hyperdrive, any webhooks (Clerk or Stripe), Stripe products/prices, Google OAuth custom credentials

### 1. Clerk (Authentication)

Clerk handles user sign-up, sign-in, and session management.

#### Create your account

1. Go to [dashboard.clerk.com/sign-up](https://dashboard.clerk.com/sign-up)
2. Sign up with email, Google, or GitHub
3. Complete any verification steps

#### Create an application

1. In the Clerk Dashboard, click **"Create application"**
2. Fill in:
   - **Application name:** `Blipp` (or `Blipp Dev`)
   - **Sign in options:** Enable **Email address** and **Google**
3. Click **"Create application"**
4. Skip the quickstart page

#### Enable Google sign-in

Just toggle **Google** on in **Configure > SSO connections**. Clerk provides shared development credentials that work out of the box — no Google Cloud project needed for local dev.

#### Copy your keys

1. Navigate to **Configure > API keys**
2. Copy the **Publishable key** (starts with `pk_test_`)
3. Copy the **Secret key** (starts with `sk_test_`) — click the eye icon to reveal it

### 2. Stripe (Payments)

You only need a sandbox API key for local dev. Billing features won't work end-to-end without products and webhooks, but the app runs fine.

Stripe uses **Sandboxes** — isolated test environments that replace the old "test mode" toggle. Each sandbox has its own API keys, data, and webhook endpoints.

#### Create your account

1. Go to [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Enter your email, name, country, and create a password
3. Verify your email

> You do **not** need to activate your account (provide bank details) for sandbox use.

#### Create a sandbox

1. In the Stripe Dashboard, click the **account picker** (top-left)
2. Click **"Create sandbox"**
3. Name it `blipp-dev` and click **Create**
4. You're now inside the sandbox — the Dashboard banner confirms this

> You can have up to 5 sandboxes per account. Each is fully isolated.

#### Get your sandbox secret key

1. Inside your sandbox, go to **Developers > API keys**
2. Click **"Reveal secret key"** under **Standard keys** and copy it — starts with `sk_test_`

> Sandbox keys still use the `sk_test_` / `pk_test_` prefix — the prefix doesn't change.

### 3. Neon (Database)

Neon is a serverless PostgreSQL provider. Free tier gives you 0.5 GB storage and 100 compute-hours/month.

#### Create your account

1. Go to [neon.tech](https://neon.tech) and click **Sign Up**
2. Sign up with GitHub, Google, or email

#### Create a project

1. Click **New Project**
2. Fill in:
   - **Project name:** `blipp`
   - **Database name:** `neondb` (default is fine)
   - **Region:** pick the one closest to you
3. Click **Create Project**

#### Copy the connection string

After creation, Neon shows a connection string like:

```
postgresql://neondb_owner:AbCdEf123456@ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

You need two variants:
- **Pooled** (hostname contains `-pooler`): used at runtime in `.dev.vars`
- **Direct** (without `-pooler`): used for running migrations

Copy both. You can always find them later under **Connect** on your project dashboard.

### 4. Anthropic (AI Distillation)

Blipp uses Claude for podcast summarization.

1. Go to [console.anthropic.com](https://console.anthropic.com/) and click **Sign Up**
2. Register with email or Google SSO, verify email and phone
3. Select **Build** as your use case
4. Add a credit card and purchase at least **$5** in credits
5. Go to **API Keys** in the sidebar ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys))
6. Click **+ Create Key**, name it `blipp-dev`, and **copy it immediately** — starts with `sk-ant-`, shown only once

### 5. OpenAI (Text-to-Speech)

Blipp uses OpenAI's `gpt-4o-mini-tts` for audio generation.

1. Go to [platform.openai.com](https://platform.openai.com/) and click **Sign Up**
2. Register and verify email + phone
3. Go to **Settings > Billing** and add a credit card, purchase at least **$5** in credits
4. Go to **API Keys** ([platform.openai.com/api-keys](https://platform.openai.com/api-keys))
5. Click **Create new secret key**, name it `blipp-tts`, permissions **All**
6. **Copy it immediately** — starts with `sk-`, shown only once

> Without billing credits, API requests fail even with a valid key.

### 6. Podcast Index (Search & Discovery)

Completely free — no credit card required.

1. Go to [api.podcastindex.org/signup](https://api.podcastindex.org/signup)
2. Enter your name and email, click **Register**
3. Check your email — Podcast Index sends you an **API Key** and **API Secret**

> You can also log into [api.podcastindex.org](https://api.podcastindex.org/) to view or regenerate credentials later.

### Create your env files

You need two files at the project root. Neither should be committed to git.

#### `.dev.vars` (server-side secrets for the Cloudflare Worker)

```env
# Auth (Clerk)
CLERK_SECRET_KEY=sk_test_paste_yours_here
CLERK_PUBLISHABLE_KEY=pk_test_paste_yours_here
CLERK_WEBHOOK_SECRET=whsec_placeholder

# Payments (Stripe — sandbox key only, placeholder for webhook)
STRIPE_SECRET_KEY=sk_test_paste_yours_here
STRIPE_WEBHOOK_SECRET=whsec_placeholder

# Database (Neon — pooled connection string)
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

# Anthropic (distillation)
ANTHROPIC_API_KEY=sk-ant-paste_yours_here

# OpenAI (TTS)
OPENAI_API_KEY=sk-paste_yours_here

# Podcast Index
PODCAST_INDEX_KEY=paste_yours_here
PODCAST_INDEX_SECRET=paste_yours_here
```

#### `.env` (client-side vars for Vite/React + Prisma CLI)

```env
# Prisma CLI (used by prisma db push / prisma migrate)
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

VITE_CLERK_PUBLISHABLE_KEY=pk_test_paste_yours_here
VITE_APP_URL=http://localhost:5173
```

> **Why placeholders?** `CLERK_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` are set to placeholders because webhooks aren't called during local dev. The app boots and runs — you just can't test checkout or webhook-driven flows.

### Set up the database

Prisma needs `DATABASE_URL` to know where your database is. The Prisma CLI reads it from `.env` automatically.

```bash
# 1. Generate the Prisma client
npx prisma generate

# 2. Push the schema to your Neon database (creates all tables)
npx prisma db push
```

> **`prisma db push`** vs **`prisma migrate dev`**: Use `db push` for initial setup and prototyping — it syncs the schema without creating migration files. Switch to `migrate dev` once you need migration history.

You can verify it worked:

```bash
# Opens Prisma Studio — a browser UI to inspect your tables
npx prisma studio
```

### Run the app

```bash
npm run dev
```

This runs `scripts/dev.mjs`, which reads `DATABASE_URL` from `.dev.vars` and exports it as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` before starting `wrangler dev`. Wrangler needs this system environment variable to emulate Hyperdrive locally — it can't use the remote Hyperdrive service during local development, and it doesn't read this variable from `.dev.vars`.

The app is now running at **http://localhost:8787**. The Worker handles `/api/*` requests and serves the Vite SPA for everything else.

---

## Part 2: Staging on Cloudflare

Deploy a working test version to a `.workers.dev` URL. This section assumes you've completed Part 1 and have all your accounts and local dev working.

**What you add:** Cloudflare account, R2 bucket, 4 Queues, Hyperdrive config, Stripe sandbox products + webhook, Clerk webhook

### 1. Cloudflare account and CLI

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and create an account
2. Log in with the Wrangler CLI (already in `devDependencies`):
   ```bash
   npx wrangler login
   ```
   This opens a browser window — authorize the CLI.

### 2. Create the R2 bucket

R2 stores generated audio clips and assembled briefings.

```bash
npx wrangler r2 bucket create blipp-audio
```

The bucket name `blipp-audio` already matches `wrangler.jsonc`. No env vars needed.

### 3. Create the Queues

Blipp uses 4 Queues for its processing pipeline. Queues require the **Workers Paid plan** ($5/month).

> **Upgrade first:** In the Cloudflare Dashboard, go to **Workers & Pages > Plans** and upgrade to Workers Paid if you haven't already.

```bash
npx wrangler queues create feed-refresh
npx wrangler queues create distillation
npx wrangler queues create clip-generation
npx wrangler queues create briefing-assembly
```

These names already match `wrangler.jsonc`. No env vars needed.

### 4. Create the Hyperdrive config

Hyperdrive accelerates database connections from Workers by pooling connections to your Neon database at the edge.

```bash
npx wrangler hyperdrive create blipp-db \
  --connection-string="postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Wrangler outputs an ID like `a1b2c3d4e5f6...`. Update `wrangler.jsonc`:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "a1b2c3d4e5f6..."  // <-- paste your real ID here
  }
]
```

### 5. Create Stripe sandbox products

Now create the actual products in your sandbox so billing flows work end-to-end. The app manages plans via the Stripe API at runtime, but you need the initial products to exist.

> Make sure you're inside your `blipp-dev` sandbox (check the Dashboard banner).

#### Blipp Pro ($9.99/month)

1. In your sandbox Dashboard, go to **More > Product catalog**
2. Click **"+ Add product"**
3. Fill in:
   - **Name:** `Blipp Pro`
   - **Price:** `9.99` USD, Monthly (Recurring)
4. Click **"Add product"**

#### Blipp Pro Plus ($19.99/month)

1. Click **"+ Add product"** again
2. Fill in:
   - **Name:** `Blipp Pro Plus`
   - **Price:** `19.99` USD, Monthly (Recurring)
3. Click **"Add product"**

> You don't need to copy Price IDs — the app reads them from Stripe at runtime.

### 6. Set up Stripe webhook

1. Inside your sandbox, go to **Developers > Webhooks**
2. Click **"Add endpoint"**
3. Configure:
   - **Endpoint URL:** `https://blipp.<your-subdomain>.workers.dev/api/webhooks/stripe`
     (you'll get this URL after deploying — you can come back and set it then)
   - **Events:** Select `checkout.session.completed` and `customer.subscription.deleted`
4. Click **"Add endpoint"**
5. On the endpoint detail page, click **"Reveal"** next to **Signing secret** and copy it — starts with `whsec_`

### 7. Set up Clerk webhook

1. In the Clerk Dashboard, go to **Configure > Webhooks**
2. Click **"Add Endpoint"**
3. Configure:
   - **Endpoint URL:** `https://blipp.<your-subdomain>.workers.dev/api/webhooks/clerk`
   - **Subscribe to events:** `user.created`, `user.updated`, `user.deleted`
4. Click **"Create"**
5. On the endpoint page, click the eye icon next to **Signing Secret** and copy it — starts with `whsec_`

### 8. Google OAuth

Keep using Clerk's shared development credentials for staging — they work fine. No changes needed from Part 1.

### 9. Deploy

Set all secrets on Cloudflare (each command prompts you to paste the value):

```bash
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put CLERK_WEBHOOK_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET
```

Then deploy:

```bash
npx wrangler deploy
```

Wrangler outputs your live URL (e.g., `https://blipp.<your-subdomain>.workers.dev`).

> **After deploying:** If you didn't set the webhook URLs in steps 6–7 yet (because you didn't have the URL), go back to Stripe and Clerk dashboards now and update the endpoint URLs to point to your deployed `.workers.dev` URL.

---

## Part 3: Production on Cloudflare

Take your staging setup live for real users. This section assumes staging (Part 2) is working.

**What changes:** Clerk production instance, Stripe live-mode keys, Google OAuth custom credentials, custom domain

### 1. Clerk production instance

Clerk separates development and production into different instances. You need a production instance with its own keys.

1. In the Clerk Dashboard, click your application name in the top-left
2. Click **"Create production instance"** (or find it under your application settings)
3. Clerk generates new production keys:
   - **Publishable key:** starts with `pk_live_`
   - **Secret key:** starts with `sk_live_`
4. Copy both — these replace the `pk_test_` / `sk_test_` keys from dev
5. Set up the webhook in the production instance:
   - **Endpoint URL:** `https://your-custom-domain.com/api/webhooks/clerk`
   - **Events:** `user.created`, `user.updated`, `user.deleted`
   - Copy the new **Signing Secret**

### 2. Stripe live-mode keys

1. In the Stripe Dashboard, switch to your **live account** via the account picker (not a sandbox)
2. You'll need to activate your account (provide business/bank details) if you haven't already
3. Go to **Developers > API keys** and copy the live **Secret key** — starts with `sk_live_`
4. Create the same two products in live mode:
   - **Blipp Pro** — $9.99/month
   - **Blipp Pro Plus** — $19.99/month
5. Set up the webhook in live mode:
   - **Endpoint URL:** `https://your-custom-domain.com/api/webhooks/stripe`
   - **Events:** `checkout.session.completed` and `customer.subscription.deleted`
   - Copy the live **Signing secret**

### 3. Google OAuth custom credentials

For production, set up your own Google OAuth credentials so users see your branding on the consent screen.

#### Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown > **New Project**
3. Name it `Blipp`, click **Create**, then select it

#### Configure the OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen** ([console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent))
2. Select **External**, click **Create**
3. Fill in:
   - **App name:** `Blipp`
   - **User support email:** your email
   - **Developer contact:** your email
4. Click **Save and Continue**
5. On **Scopes**, add `email`, `profile`, `openid`, then **Save and Continue**
6. Optionally add test users, then **Save and Continue**

#### Create OAuth client credentials

1. Go to **APIs & Services > Credentials** ([console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials))
2. Click **+ Create Credentials > OAuth client ID**
3. Fill in:
   - **Application type:** `Web application`
   - **Name:** `Blipp (Clerk)`
   - **Authorized redirect URIs:** Add your Clerk production OAuth callback URL
     (find it in Clerk Dashboard > **Configure > SSO connections > Google** under the production instance)
4. Click **Create**, copy the **Client ID** and **Client Secret**

#### Add credentials to Clerk production

1. In your Clerk **production** instance, go to **Configure > SSO connections > Google**
2. Toggle **Use custom credentials** on
3. Paste the **Client ID** and **Client Secret**
4. Click **Save**

### 4. Custom domain

1. Add your domain to Cloudflare (as a full zone or via CNAME setup)
2. In the Cloudflare Dashboard, go to **Workers & Pages > your worker > Settings > Domains & Routes**
3. Add your custom domain

### 5. Deploy with live secrets

Set all production secrets (replace sandbox values with live ones):

```bash
npx wrangler secret put CLERK_SECRET_KEY          # sk_live_...
npx wrangler secret put CLERK_PUBLISHABLE_KEY      # pk_live_...
npx wrangler secret put CLERK_WEBHOOK_SECRET       # whsec_... (from production instance)
npx wrangler secret put STRIPE_SECRET_KEY          # sk_live_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # whsec_... (from live mode)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET
```

Then deploy:

```bash
npx wrangler deploy
```

Your app is live at your custom domain.
