# Blipp agent context

Purpose: durable orientation notes for future AI/agentic workers. This file complements `CLAUDE.md` (quick conventions) and the deeper reference docs in `docs/architecture.md`, `docs/pipeline.md`, `docs/data-model.md`, `docs/admin-platform.md`, and `docs/api-reference.md`.

Last reviewed: 2026-05-09.

## Product in one paragraph

Blipp turns long podcast episodes into short personalized audio briefings ("blipps"). Users subscribe to podcasts, request or receive episode briefings, and listen in a mobile-first React/Capacitor app. The backend ingests podcasts, fetches or transcribes episodes, distills transcripts into claims, writes a narrative, renders TTS audio, and assembles per-user feed items. Public SEO surfaces (`/p/*`, `/pulse`, `/browse/*`) expose selected catalog/content, while `/admin/*` is the internal operations console.

## Repository shape

- `worker/`: Cloudflare Worker backend.
  - `worker/index.ts`: single entry point exporting `fetch`, `queue`, and `scheduled` handlers.
  - `worker/routes/`: Hono API routes, public SSR routes, webhooks, and admin routes.
  - `worker/routes/admin/`: internal admin API modules; protected by `requireAdmin` in `worker/routes/admin/index.ts`.
  - `worker/queues/`: Cloudflare Queue consumers and scheduled handlers.
  - `worker/lib/`: shared business logic: AI providers, model resolution, plan limits, cron jobs, service keys, errors, work products, etc.
  - `worker/middleware/`: request id, auth, Prisma lifecycle, API key auth, admin checks, rate limits, security headers.
- `src/`: React 19 + Vite SPA and PWA frontend.
  - `src/App.tsx`: route table for public, signed-in user, and admin pages.
  - `src/pages/`: user-facing app pages, public marketing pages, browse pages, and admin pages.
  - `src/components/`: shared UI; admin-specific panels live under `src/components/admin/`.
  - `src/lib/`: API clients, hooks, offline/mobile helpers, generated Prisma output barrel.
- `prisma/`: canonical schema, migrations, seed scripts, DB utility scripts.
- `docs/`: architecture, pipeline, data model, admin platform, deployment, plans, decisions, and handoffs.
- `ios/`: Capacitor iOS shell.
- `scripts/`: local/dev/deploy/database helper scripts.
- `tools/mcp-admin/`: auxiliary admin tooling package.

Current rough codebase size excluding dependency/build/iOS output directories: ~751 tracked source/doc/config files and ~177k lines, dominated by TypeScript/TSX.

## Runtime architecture

Blipp is one Cloudflare Worker deployed as `blipp-staging` and `blipp`:

1. `fetch` handler: Hono server for `/api/*`, public SSR pages (`/p/*`, `/pulse/*`, sitemap/robots/ads), Clerk proxies, and static SPA assets.
2. `queue` handler: dispatcher in `worker/queues/index.ts`; normalizes queue names by stripping `-staging`/`-production` and routes messages to the right consumer.
3. `scheduled` handler: 5-minute heartbeat for registered `CronJob` rows plus Sunday Pulse generation cron (`0 14 * * SUN`).

Core services/bindings:

- Cloudflare Workers + nodejs compatibility.
- Neon Postgres through Cloudflare Hyperdrive, accessed via Prisma 7 generated clients.
- Cloudflare R2 for work products, audio clips, benchmark artifacts, and related files.
- Cloudflare Queues for pipeline/background work, plus a shared dead-letter queue.
- Cloudflare KV for rate limiting.
- Workers AI as one AI provider option.
- Clerk for auth, Stripe for web billing, RevenueCat for Apple IAP, ZeptoMail for email, Podcast Index + Apple Podcasts for catalog discovery.

## HTTP/middleware flow

`worker/index.ts` order matters:

1. `/api/__clerk/*` and `/__clerk/*` Clerk proxy paths run before normal API middleware for native/Capacitor compatibility.
2. `/api/auth/*` native auth handles provider-token exchange itself.
3. `/api/*` gets request ID, CORS, Clerk auth/bypass, request logging, Prisma middleware, API-key auth, rate limiting, and then route modules.
4. `prismaMiddleware` creates a per-request client available as `c.get("prisma")`; route handlers should use that and should not manually disconnect.
5. Webhooks and health checks are carved out from auth/rate-limit behavior where needed.
6. `securityHeaders` applies to all responses, including the SPA.

API route tree (`worker/routes/index.ts`) mounts major modules under `/api`: `me`, `plans`, `podcasts`, `subscriptions`, `briefings`, `feed`, `clips`, `blipps`, `billing`, `iap`, `recommendations`, `voice-presets`, `feedback`, `support`, `events`, `public`, `webhooks/{clerk,stripe,revenuecat}`, `admin`, `internal/clean`, and `assets`.

## Pipeline mental model

Pipeline entry is a `BriefingRequest` dispatched to the `ORCHESTRATOR_QUEUE` with `action: "evaluate"`. The orchestrator creates one `PipelineJob` per episode/tier/voice group, finds the earliest missing cached artifact, and sends stage messages.

Stages:

1. `TRANSCRIPTION_QUEUE` / `worker/queues/transcription.ts`: transcript URL waterfall, Podcast Index lookup, then STT fallback. Writes transcript `WorkProduct` and `Distillation.transcript`.
2. `DISTILLATION_QUEUE` / `distillation.ts`: LLM claim extraction from transcript, song/music invalidation, claim embedding for Pulse. Writes `WorkProduct(CLAIMS)` and `Distillation.claimsJson`.
3. `NARRATIVE_GENERATION_QUEUE` / `narrative-generation.ts`: LLM narrative from claims for a duration tier/voice. Writes `WorkProduct(NARRATIVE)` and `Clip.narrativeText`.
4. `AUDIO_GENERATION_QUEUE` maps to Cloudflare queue name `clip-generation` / `audio-generation.ts`: TTS with provider failover and chunking. Writes `WorkProduct(AUDIO_CLIP)` and marks `Clip` completed.
5. `BRIEFING_ASSEMBLY_QUEUE` / `briefing-assembly.ts`: creates `Briefing` rows, links `FeedItem.briefingId`, and rolls up request status to completed/degraded/failed.

Important invariants:

- Stage order is strict and CAS-protected through `PipelineJob.currentStage`.
- Transcription and distillation are keyed only by episode and coalesced using `Distillation.transcriptionStartedAt` / `distillationStartedAt` locks to avoid duplicate paid work.
- Narrative/audio are keyed by `(episodeId, durationTier, voicePresetId)` and deduped through `Clip` uniqueness.
- `SEO_BACKFILL` mode stops after distillation.
- Queue handlers own Prisma lifecycle with `createPrismaClient`; Hono routes do not.

## Data model landmarks

Canonical source: `prisma/schema.prisma`.

High-value domains:

- Identity/billing: `User`, `Plan`, `BillingSubscription`, `BillingEvent`, `ApiKey`, `ServiceKey`, `AuditLog`.
- Catalog: `Podcast`, `Episode`, `Category`, `PodcastCategory`, `PodcastRequest`.
- User content: `Subscription`, `FeedItem`, `Briefing`, `Clip`, `Distillation`, `CatalogBriefing`.
- Pipeline audit: `BriefingRequest`, `PipelineJob`, `PipelineStep`, `PipelineEvent`, `WorkProduct`.
- AI operations: `AiModel`, `AiModelProvider`, `AiServiceError`, `SttExperiment`, `ClaimsExperiment`.
- Runtime configuration and content: `PlatformConfig`, `PromptVersion`, `VoicePreset`, Pulse models.
- Cron/admin operations: `CronJob`, `CronRun`, `CronRunLog`, catalog/episode-refresh jobs.
- Growth/analytics: recommendations, feedback, support, listen-original events, publisher reports, sports/geo, daily digest.

Most child rows cascade on parent delete; check `docs/data-model.md` before destructive schema work.

## Frontend surfaces

Public routes in `src/App.tsx`:

- Marketing/legal: `/`, `/pricing`, `/about`, `/contact`, `/support`, `/how-it-works`, `/tos`, `/privacy`.
- Public catalog: `/browse`, `/browse/category/:slug`, `/browse/show/:slug`; intended noindex.
- Worker-side SSR public content: `/p/*` and `/pulse/*` are served by Worker routes, not the React route table.

Signed-in user routes use `MobileLayout` and Clerk `SignedIn`:

- `/home`, `/discover`, `/discover/:podcastId`, `/library`, `/settings`, `/history`, `/play/:id`, `/onboarding`.

Admin routes under `/admin` lazy-load through `AdminGuard` + `AdminLayout`:

- Overview, catalog/podcast operations, pipeline/request/briefing operations, AI/model/prompt/benchmark operations, user/plan/analytics/recommendations/feedback/support, system settings/feature flags/API keys/service keys/scheduled jobs/logs/audit/DLQ/voice presets/Pulse.
- Backend access is always enforced again by `requireAdmin`; frontend guard is only UX.

## Admin and operations

The admin platform is an operations console, not a separate app. The source-of-truth doc is `docs/admin-platform.md`.

Key admin principles:

- Every non-GET 2xx admin response writes `AuditLog` through middleware in `worker/routes/admin/index.ts`.
- Runtime knobs live mostly in `PlatformConfig` and are cached for 60 seconds.
- Stage model/provider assignments and prompts are editable from `/admin/stage-configuration` and resolved through `worker/lib/model-resolution.ts`.
- Service keys are preferably stored encrypted in DB `ServiceKey` rows and resolved through `service-key-resolver`; env vars are fallback.
- Worker observability and Cloudflare API-backed log views require `CF_API_TOKEN`, `CF_ACCOUNT_ID`, and `WORKER_SCRIPT_NAME`.

## Development commands and conventions

Use these from repo root:

- Install: `npm install --legacy-peer-deps`.
- Dev server: `npm run dev` (Cloudflare Vite plugin + Worker at `http://localhost:8787`).
- Build: `npm run build`.
- Tests: `npm test`; specific file: `npx vitest run path/to/test.ts`.
- Worker tests may need memory: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`.
- Typecheck: `npm run typecheck`.
- Prisma generate: `npx prisma generate`, then ensure `src/generated/prisma/index.ts` barrel exists because the generated output is gitignored.
- New migration: edit `prisma/schema.prisma` then `npm run db:migrate:new <snake_case_name>` and review SQL.
- Deploy staging: `npm run deploy`; production: `npm run deploy:production`; quick deploy scripts skip build.

Known gotchas:

- Always use `--legacy-peer-deps` with npm install because of Clerk peer dependency conflicts.
- Local DB URLs must use the Neon pooler endpoint (`-pooler`, port 5432, `sslmode=require`).
- Do not duplicate `clerkMiddleware()` in route files; it is global for `/api/*` except explicit bypasses.
- Admin routes should use shared helpers from `worker/lib/admin-helpers.ts` where applicable.
- Route tests need to inject mock Prisma into Hono context, mirroring production middleware.
- Vitest v4 `vi.clearAllMocks()` clears mock implementations; reset `mockResolvedValue` in `beforeEach`.
- Tailwind v4 conventions differ from v3: keep `@keyframes` outside `@theme`; prefer `var(--color-*)` over `theme()`.

## Recent/product-specific context worth preserving

- Public SEO/content surface work added `/browse/*`, public catalog APIs, sample player, AdSense plumbing, and Pulse blog/admin review workflow.
- Pulse has hard editorial gates: first 4-6 posts must be human-written; cron no-ops until at least 6 `PUBLISHED` posts and at least 4 `HUMAN` posts exist. Do not seed fake editor bios or fake Pulse posts.
- AdSense is wired but disabled through `ADS_ENABLED=false` and empty `ADS_ROUTES`; staged rollout should opt in route prefixes carefully.
- Sample player behavior is intentionally click-to-play to satisfy iOS gesture rules.
- User prefers to push/deploy manually; do not assume automated remote push/deploy from agent sessions.

## Where to look first for common changes

- New API endpoint: `worker/routes/*`, route mount in `worker/routes/index.ts`, tests in `worker/routes/__tests__` or `worker/routes/admin/__tests__`.
- New admin endpoint: `worker/routes/admin/*`, shared helpers in `worker/lib/admin-helpers.ts`, frontend page under `src/pages/admin`, possibly panel components under `src/components/admin`.
- Pipeline change: `worker/queues/*`, `worker/lib/queue-helpers.ts`, `worker/lib/queue-messages.ts`, `docs/pipeline.md`, queue tests.
- Schema change: `prisma/schema.prisma`, migration under `prisma/migrations`, generated clients, `docs/data-model.md` if model semantics change.
- AI/provider change: `worker/lib/model-resolution.ts`, `worker/lib/llm-providers.ts`, `worker/lib/stt/*`, `worker/lib/tts/*`, `AiModel*` seed/config, admin stage/model UI.
- Runtime config: `worker/lib/config-registry.ts`, `PlatformConfig`, admin config routes/pages.
- Deployment/bindings: `wrangler.jsonc`, `worker/types.ts`, `docs/guides/production-deployment.md`.

## Reference docs map

- `CLAUDE.md`: quick commands, conventions, and common pitfalls.
- `docs/architecture.md`: full system architecture, middleware, queues, bindings, auth, billing, recommendations, Pulse, SEO, native app.
- `docs/pipeline.md`: stage-by-stage pipeline and orchestrator invariants.
- `docs/data-model.md`: grouped model reference and cascade/index notes.
- `docs/admin-platform.md`: admin UI/API inventory and design system.
- `docs/guides/development.md`: local setup, env files, tests, scripts.
- `docs/guides/production-deployment.md`: production rollout/runbook.
- `HANDOFF.md` and `STATUS.md`: historical phase handoff notes; verify freshness before treating as current.
