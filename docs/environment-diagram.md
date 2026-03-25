# Blipp Environment & Config Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    DEVELOPMENT (local)                              │
│                                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────┐                         │
│  │  Frontend (Vite dev) │          │  Worker (wrangler dev)│                         │
│  │  localhost:5173       │────API──▶│  localhost:8787       │                         │
│  └──────────┬───────────┘          └──────────┬───────────┘                         │
│             │                                 │                                     │
│  ┌──────────┴───────────┐          ┌──────────┴───────────┐                         │
│  │  .env                │          │  .dev.vars            │                         │
│  │  ├ DATABASE_URL      │          │  ├ ENVIRONMENT        │                         │
│  │  ├ VITE_CLERK_PUB_KEY│          │  ├ CLERK_SECRET_KEY   │                         │
│  │  ├ PODCAST_INDEX_KEY │          │  ├ CLERK_PUB_KEY      │                         │
│  │  └ PODCAST_INDEX_SEC │          │  ├ CLERK_WEBHOOK_SEC  │                         │
│  └──────────────────────┘          │  ├ STRIPE_SECRET_KEY  │                         │
│                                    │  ├ STRIPE_WEBHOOK_SEC │                         │
│  ┌──────────────────────┐          │  ├ DATABASE_URL       │                         │
│  │  .env.local (override)│         │  ├ CF_HYPERDRIVE_*    │                         │
│  │  └ VITE_CLERK_PUB_KEY│          │  ├ ANTHROPIC_API_KEY  │                         │
│  │    (pk_test_... here) │         │  ├ OPENAI_API_KEY     │                         │
│  └──────────────────────┘          │  ├ PODCAST_INDEX_KEY  │                         │
│                                    │  ├ PODCAST_INDEX_SEC  │                         │
│  ┌──────────────────────┐          │  ├ DEEPGRAM_API_KEY   │                         │
│  │  .env.production     │          │  ├ ASSEMBLYAI_API_KEY │                         │
│  │  └ VITE_CLERK_PUB_KEY│          │  └ GROQ_API_KEY       │                         │
│  │    (pk_live_...)      │         └──────────────────────┘                         │
│  └──────────────────────┘                                                           │
└───────────────┬───────────────────────────────┬─────────────────────────────────────┘
                │                               │
                │                               │
     ┌──────────┴──────────┐        ┌───────────┴───────────┐
     │   Clerk (Dev)       │        │   Neon (Staging DB)   │
     │   pk_test_ / sk_test│        │   ep-summer-breeze-*  │
     │                     │        │   (shared w/ staging)  │
     └─────────────────────┘        └───────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    STAGING                                          │
│                              staging.podblipp.com                                   │
│                                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────┐                         │
│  │  Frontend (built)    │          │  CF Worker            │                         │
│  │  static assets on CF │────API──▶│  "blipp-staging"      │                         │
│  └──────────┬───────────┘          └──────────┬───────────┘                         │
│             │                                 │                                     │
│  ┌──────────┴───────────┐          ┌──────────┴───────────┐                         │
│  │ GitHub Actions (build)│         │  wrangler.jsonc vars  │                         │
│  │ (injected at build)  │          │  ├ ENVIRONMENT=staging│                         │
│  │                      │          │  ├ APP_ORIGIN         │                         │
│  │  VITE_CLERK_PUB_KEY  │          │  └ ALLOWED_ORIGINS    │                         │
│  │   ← GH secret:       │         └──────────────────────┘                         │
│  │   VITE_CLERK_PUB_KEY │                                                           │
│  │   _STAGING           │          ┌──────────────────────┐                         │
│  │                      │          │  CF Worker Secrets    │                         │
│  │  VITE_APP_URL        │          │  (wrangler secret put)│                         │
│  │   ← GH var:          │         │  ├ CLERK_SECRET_KEY   │                         │
│  │   STAGING_URL        │          │  ├ CLERK_PUB_KEY      │                         │
│  └──────────────────────┘          │  ├ CLERK_WEBHOOK_SEC  │                         │
│                                    │  ├ STRIPE_SECRET_KEY  │                         │
│  ┌──────────────────────┐          │  ├ STRIPE_WEBHOOK_SEC │                         │
│  │ GH Actions also needs│          │  ├ ANTHROPIC_API_KEY  │                         │
│  │  CLOUDFLARE_API_TOKEN│          │  ├ OPENAI_API_KEY     │                         │
│  └──────────────────────┘          │  ├ PODCAST_INDEX_*    │                         │
│                                    │  ├ DEEPGRAM_API_KEY   │                         │
│                                    │  ├ ASSEMBLYAI_API_KEY │                         │
│                                    │  └ GROQ_API_KEY       │                         │
│                                    └──────────────────────┘                         │
│                                                                                     │
│  CF Bindings: Hyperdrive (a915...) → Neon staging                                   │
│               R2: blipp-audio-staging                                                │
│               KV: RATE_LIMIT_KV (3d3b...)                                            │
│               9 Queues (*-staging)                                                   │
└───────────────┬───────────────────────────────┬─────────────────────────────────────┘
                │                               │
     ┌──────────┴──────────┐        ┌───────────┴───────────┐
     │  Clerk (Production) │        │   Neon (Staging DB)   │
     │  pk_live_ / sk_live │        │   ep-summer-breeze-*  │
     │                     │        │                       │
     │  * staging uses live│        └───────────────────────┘
     │    keys (Capacitor  │
     │    redirect issue)  │
     └─────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   PRODUCTION                                        │
│                                podblipp.com                                          │
│                                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────┐                         │
│  │  Frontend (built)    │          │  CF Worker            │                         │
│  │  static assets on CF │────API──▶│  "blipp"              │                         │
│  └──────────┬───────────┘          └──────────┬───────────┘                         │
│             │                                 │                                     │
│  ┌──────────┴───────────┐          ┌──────────┴───────────┐                         │
│  │ GitHub Actions (build)│         │  wrangler.jsonc       │                         │
│  │ (injected at build)  │          │  env.production vars  │                         │
│  │                      │          │  ├ ENVIRONMENT=prod   │                         │
│  │  VITE_CLERK_PUB_KEY  │          │  ├ APP_ORIGIN         │                         │
│  │   ← GH secret:       │         │  └ ALLOWED_ORIGINS    │                         │
│  │   VITE_CLERK_PUB_KEY │         └──────────────────────┘                         │
│  │   _PRODUCTION        │                                                           │
│  │                      │          ┌──────────────────────┐                         │
│  │  VITE_APP_URL        │          │  CF Worker Secrets    │                         │
│  │   = https://podblipp │          │  (--env production)   │                         │
│  │     .com             │          │  ├ CLERK_SECRET_KEY   │                         │
│  └──────────────────────┘          │  ├ CLERK_PUB_KEY      │                         │
│                                    │  ├ CLERK_WEBHOOK_SEC  │                         │
│  ┌──────────────────────┐          │  ├ STRIPE_SECRET_KEY  │                         │
│  │ GH Actions also needs│          │  ├ STRIPE_WEBHOOK_SEC │                         │
│  │  CLOUDFLARE_API_TOKEN│          │  ├ ANTHROPIC_API_KEY  │                         │
│  │  PRODUCTION_DB_URL   │          │  ├ OPENAI_API_KEY     │                         │
│  │  (for prisma db push)│          │  ├ PODCAST_INDEX_*    │                         │
│  └──────────────────────┘          │  ├ DEEPGRAM_API_KEY   │                         │
│                                    │  ├ ASSEMBLYAI_API_KEY │                         │
│                                    │  └ GROQ_API_KEY       │                         │
│                                    └──────────────────────┘                         │
│                                                                                     │
│  CF Bindings: Hyperdrive (54bb...) → Neon production                                │
│               R2: blipp-audio                                                        │
│               KV: RATE_LIMIT_KV (1722...)                                            │
│               9 Queues (no suffix)                                                   │
│               Cron: */5 * * * *                                                      │
└───────────────┬───────────────────────────────┬─────────────────────────────────────┘
                │                               │
     ┌──────────┴──────────┐        ┌───────────┴───────────┐
     │  Clerk (Production) │        │  Neon (Production DB) │
     │  pk_live_ / sk_live │        │  (separate instance)  │
     └─────────────────────┘        └───────────────────────┘


═══════════════════════════════════════════════════════════════════════════════════════
                              EXTERNAL SERVICES SUMMARY
═══════════════════════════════════════════════════════════════════════════════════════

  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
  │    Clerk      │    │    Stripe     │    │  Neon (DB)    │    │  Cloudflare   │
  │               │    │               │    │               │    │               │
  │  Dev instance │    │  Test/Sandbox │    │  Staging DB   │    │  Workers      │
  │  ├ pk_test_   │    │  ├ sk_test_   │    │  (shared w/   │    │  R2 Buckets   │
  │  └ sk_test_   │    │  └ whsec_     │    │   local dev)  │    │  Queues       │
  │               │    │               │    │               │    │  Hyperdrive   │
  │  Prod instance│    │  Live         │    │  Production DB│    │  KV           │
  │  ├ pk_live_   │    │  ├ sk_live_   │    │  (separate)   │    │  AI           │
  │  └ sk_live_   │    │  └ whsec_     │    │               │    │               │
  │               │    │               │    │               │    │               │
  │  Used by:     │    │  Used by:     │    │  Used by:     │    │               │
  │  Dev → Dev    │    │  Dev → Test   │    │  Dev → Stg DB │    │               │
  │  Stg → Prod*  │    │  Stg → ?      │    │  Stg → Stg DB │    │               │
  │  Prod → Prod  │    │  Prod → Live  │    │  Prod → Prd DB│    │               │
  └───────────────┘    └───────────────┘    └───────────────┘    └───────────────┘

  * Staging switched to Clerk Production keys (pk_live/sk_live) for Capacitor
    redirect origin compatibility.
```
