# Admin Platform

The admin platform is the internal control panel for Blipp. It's a lazy-loaded React section of the same SPA, guarded by Clerk auth + `User.isAdmin`, and styled with the Moonchild dark-navy theme (shadcn/ui + Tailwind v4). All admin pages sit under `/admin/*` and map 1:1 to API modules under `/api/admin/*` (see [api-reference.md](./api-reference.md)).

## Access Control

- **Backend gate** — `worker/middleware/admin.ts` exposes `requireAdmin`, applied globally via `adminRoutes.use("*", requireAdmin)` in `worker/routes/admin/index.ts`. 401 if no Clerk session, 403 if `!User.isAdmin`.
- **Audit trail** — every successful (2xx) non-GET admin response writes an `AuditLog` row (actor Clerk ID + email, action derived from method + path, entity, before/after, request metadata).
- **Frontend gate** — `src/components/admin-guard.tsx` calls `/api/admin/dashboard/health` and renders only if the user is admin. Admin pages are lazy-loaded via `React.lazy()` in `src/App.tsx`.
- **Layout** — `src/layouts/admin-layout.tsx` provides the dark sidebar (desktop) / drawer (mobile), collapsible groups, top-bar with search + notifications + user menu. A "User App" link returns to `/home`.

## Page Inventory

32 admin pages, grouped by domain. Each entry lists the route, source file, and the backend module(s) it calls.

### Overview

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| Command Center | `/admin/command-center` | `src/pages/admin/command-center.tsx` | `/api/admin/dashboard` |

System health snapshot. Stat cards for podcasts / users / episodes / briefings with 7-day trends; recent pipeline activity; active issues; cost summary; feed-refresh status.

### Podcasts

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| Catalog | `/admin/catalog` | `catalog.tsx` | `/api/admin/podcasts`, `/api/admin/episodes` |
| Catalog Discovery | `/admin/catalog-discovery` | `catalog-discovery.tsx` | `/api/admin/catalog-seed` |
| Podcast Sources | `/admin/podcast-sources` | `podcast-sources.tsx` | `/api/admin/podcasts`, `/api/admin/requests` |
| Episode Refresh | `/admin/episode-refresh` | `episode-refresh.tsx` | `/api/admin/episode-refresh` |
| Geo Tagging | `/admin/geo-tagging` | `geo-tagging.tsx` | `/api/admin/geo-tagging` |
| Podcast Settings | `/admin/podcast-settings` | `podcast-settings.tsx` | `/api/admin/config` (`catalog.*`, `episodes.aging.*`, `recommendations.profile*`) |

- **Catalog** — master list (search / filter / sort / paginate) with feed-health badges. Detail modal shows podcast info + stats + episodes accordion (each episode expands into Overview tab — metadata, cost, transcript/audio links — and Clips tab — each clip shows duration tier, status, inline audio, and expandable feed items with request traceability). Actions: add, edit, archive, refresh.
- **Catalog Discovery** — triggers Apple top-200 or Podcast Index trending discovery. Job list tracks discovery/upsert progress with a single Discovery accordion showing newly inserted podcasts. On completion, an `EpisodeRefreshJob` is auto-created and linked. Controls: cancel, archive, delete. Bulk archive. Catalog delete with type-to-confirm.
- **Podcast Sources** — moderate user-submitted `PodcastRequest` rows, approve → upsert podcast, reject / mark duplicate.
- **Episode Refresh** — formalized episode-refresh job tracking. Trigger manual refreshes ("Refresh Subscribed" / "Refresh All"), monitor cron runs. Job cards show scope/trigger badges, progress bars, stats (podcasts checked, podcasts with updates, new episodes, prefetch progress). Detail expands into Podcasts / Episodes / Content Prefetch accordions + errors tab. Controls: pause / resume / cancel / archive / delete.
- **Geo Tagging** — kick off keyword + LLM geo classification; view status of last run.
- **Podcast Settings** — edit catalog-wide config (source selection, request limits, episode aging, recommendation profile batch size, etc.).

### Pipeline

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| Pipeline | `/admin/pipeline` | `pipeline.tsx` | `/api/admin/pipeline` |
| Requests | `/admin/requests` | `requests.tsx` | `/api/admin/requests` |
| Briefings | `/admin/briefings` | `briefings.tsx` | `/api/admin/briefings` |
| DLQ Monitor | `/admin/dlq` | `dlq.tsx` | `/api/admin/pipeline` (DLQ view) |

- **Pipeline** — job browser with filters (stage, status, requestId, search). Job detail shows the step timeline with per-step inputs/outputs/events. Stage aggregate stats, manual triggers (feed refresh, per stage, per episode), bulk retry for failed jobs.
- **Requests** — `BriefingRequest` browser with status filter. Request detail has a per-job, per-step progress tree with `WorkProduct` links. Work-product preview (text/JSON/audio metadata). Test briefing creation dialog with episode picker.
- **Briefings** — briefing list with filters (user, status, sort). Each briefing card shows user info, clip status, duration tier, actual seconds, podcast/episode info, and feed-item count. Detail shows clip metadata (podcast image, titles, duration), audio link, ad audio section (placeholder until ads ship), and linked feed items table.
- **DLQ Monitor** — read-only view of the shared `dead-letter` queue. Surfaces dropped messages for manual triage.

### AI

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| Model Registry | `/admin/model-registry` | `model-registry.tsx` | `/api/admin/ai-models` |
| Stage Configuration | `/admin/stage-configuration` | `stage-configuration.tsx` | `/api/admin/config` (`ai.*.model`, `pipeline.stage.*.enabled`, `prompt.*`) |
| STT Benchmark | `/admin/stt-benchmark` | `stt-benchmark.tsx` | `/api/admin/stt-benchmark` |
| Claims Benchmark | `/admin/claims-benchmark` | `claims-benchmark.tsx` | `/api/admin/claims-benchmark` |
| AI Errors | `/admin/ai-errors` | `ai-errors.tsx` | `/api/admin/ai-errors` |
| Voice Presets | `/admin/voice-presets` | `voice-presets.tsx` | `/api/admin/voice-presets` |

- **Model Registry** — browse all `AiModel` rows by stage. Add new models with developer and notes. Add/edit/remove providers per model with pricing metadata (per-minute, per-token, per-character). Toggle availability, set defaults, view pricing update timestamps.
- **Stage Configuration** — single page that combines the legacy "Stage Models" + "Prompt Management" panels. Sets `ai.{stage}.model` (+ `.secondary`, `.tertiary`) and edits the prompt templates for `distillation` and `narrative` stages (backed by `PlatformConfig.prompt.*` with hardcoded defaults as fallback). Per-stage enable toggles and rollback to defaults. Changes take effect within 60 s (config cache TTL); all changes are audit-logged. Legacy URLs `/admin/stage-models` and `/admin/prompt-management` redirect here.
- **STT Benchmark** — create experiments comparing multiple STT models/providers across episodes at various playback speeds. Episode picker filters to episodes with official transcripts (WER ground truth). Frontend-driven runner polls tasks one at a time. Results grid (WER / cost / latency per model × provider × speed). Winner detection for best WER / cost / latency. Transcript diff viewer. Audio proxy for CORS-free playback. R2 storage for speed-adjusted audio + transcripts.
- **Claims Benchmark** — analogous experiment flow for claim-extraction quality. Baseline + judge model configuration, coverage + hallucination scoring, per-episode verdict view.
- **AI Errors** — searchable `AiServiceError` log with filters (service, provider, category, severity, correlationId, episodeId, resolved).
- **Voice Presets** — CRUD for TTS voice presets. Plan gating via `Plan.allowedVoicePresetIds`. Admin preview endpoint for auditioning.

### Users & Growth

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| Users | `/admin/users` | `users.tsx` | `/api/admin/users` |
| Plans | `/admin/plans` | `plans.tsx` | `/api/admin/plans` |
| Analytics | `/admin/analytics` | `analytics.tsx` | `/api/admin/analytics` |
| Recommendations | `/admin/recommendations` | `recommendations.tsx` | `/api/admin/recommendations` |
| Feedback | `/admin/feedback` | `feedback.tsx` | `/api/admin/feedback` |
| Blipp Feedback | `/admin/blipp-feedback` | `blipp-feedback.tsx` | `/api/admin/blipp-feedback` |
| Support | `/admin/support` | `support.tsx` | `/api/admin/support` |

- **Users** — segmented filters (all / power users / at risk / trial ending / never active). User list with badges; detail page showing subscriptions and recent feed items. Admin toggle, plan management, manual welcome-email resend, GDPR export/delete.
- **Plans** — CRUD for `Plan` rows with slug, limits (`briefingsPerWeek`, `maxDurationMinutes`, `maxPodcastSubscriptions`, `pastEpisodesLimit`, `concurrentPipelineJobs`), feature flags (`adFree`, `priorityProcessing`, `earlyAccess`, `transcriptAccess`, `dailyDigest`, `offlineAccess`, `publicSharing`), monthly/annual pricing (Stripe + Apple product IDs), allowed voice presets, marketing display (features list, `highlighted`, `sortOrder`, `isDefault`). Soft delete when no users reference the plan.
- **Analytics** — Costs (daily cost chart by stage, period comparison, per-model breakdown), Usage (feed-item / episode / user trends, tier distribution, peak times), Quality (time-fitting accuracy, claim coverage, transcription coverage), Pipeline (throughput, success rates, bottlenecks).
- **Recommendations** — inspect/recompute `UserRecommendationProfile` and `RecommendationCache` for a given user. Trending explanations and diagnostic scoring.
- **Feedback** — general user feedback browser.
- **Blipp Feedback** — per-blipp feedback with technical-failure filter and reason filters.
- **Support** — public contact-form inbox; resolve or delete entries.

### System

| Page | Route | Source | Backs onto |
|------|-------|--------|-----------|
| System Settings | `/admin/system-settings` | `system-settings.tsx` | `/api/admin/config` |
| Feature Flags | `/admin/feature-flags` | `feature-flags.tsx` | `/api/admin/config` (`feature.*`) |
| API Keys | `/admin/api-keys` | `api-keys.tsx` | `/api/admin/api-keys` |
| Service Keys | `/admin/service-keys` | `service-keys.tsx` | `/api/admin/service-keys` |
| Scheduled Jobs | `/admin/scheduled-jobs` | `scheduled-jobs.tsx` | `/api/admin/cron-jobs` |
| Worker Logs | `/admin/worker-logs` | `worker-logs.tsx` | `/api/admin/worker-logs` |
| Audit Log | `/admin/audit-log` | `audit-log.tsx` | `/api/admin/audit-log` |

- **System Settings** — runtime config editor grouped by prefix (rate limits, circuit breaker, cost alerts, recommendation weights, digest defaults, trial days, …). Each group owns a subset of `CONFIG_REGISTRY` entries. Changes take effect within 60 s.
- **Feature Flags** — list / create / edit `feature.*` flags: rollout percentage, plan availability, allowlist/denylist, startDate/endDate. Helper widgets compute the deterministic SHA-256-based bucket for a given userId preview.
- **API Keys** — create scoped Bearer API keys (`blp_live_*`). UI shows `keyPrefix`, scopes, `expiresAt`, `lastUsedAt`. Keys are shown once at creation. Revoke via soft `revokedAt`.
- **Service Keys** — manage encrypted `ServiceKey` rows. Provider + envKey slot, primary-key toggles, per-context assignments (e.g. `serviceKey.assignment.pipeline.distillation.anthropic → ServiceKey.id`), last-validated timestamp, rotation alert after `rotateAfterDays`. Includes one-shot health probes per provider (Anthropic / OpenAI / Groq / Deepgram / Stripe / Clerk / Podcast Index / Cloudflare / Neon).
- **Scheduled Jobs** — toggle enabled, adjust `intervalMinutes`, manually trigger (bypasses interval), browse recent `CronRun` + `CronRunLog` entries. 12 registered jobs (see [architecture.md](./architecture.md#scheduled-jobs)).
- **Worker Logs** — queries Cloudflare Workers Observability via `CF_API_TOKEN`. Filter by level, path, request ID, message.
- **Audit Log** — browse every admin mutation with actor, action, entity, before/after snapshots, metadata (IP, user agent).

## Design System ("Moonchild")

| Token | Value |
|-------|-------|
| Background | `#0A1628` (dark navy) |
| Cards | `#1A2942` |
| Accents | `#3B82F6` (blue) |
| Font | Inter |

Built on shadcn/ui primitives (22+ components) + Tailwind v4 utilities + `tw-animate-css`. Reusable admin panels live under `src/components/admin/{catalog,pipeline,catalog-discovery,claims-benchmark,command-center,model-registry,episode-refresh,analytics,...}`.

## Legacy Redirects

Route-level redirects (in `src/App.tsx`) keep old bookmarks working:

- `/admin/catalog-seed` → `/admin/catalog-discovery`
- `/admin/stage-models` → `/admin/stage-configuration`
- `/admin/prompt-management` → `/admin/stage-configuration`
- `/dashboard` → `/home` · `/billing` → `/settings` · `/briefing/*` → `/home`

## Source Map

| Layer | Path |
|-------|------|
| Admin pages | `src/pages/admin/*.tsx` (32 files) |
| Admin panels | `src/components/admin/**/*.tsx` |
| Admin layout | `src/layouts/admin-layout.tsx` |
| Admin guard | `src/components/admin-guard.tsx` |
| Admin API hook | `src/lib/api-client.ts` (`useAdminFetch()`) |
| Admin backend routes | `worker/routes/admin/*.ts` (31 modules) |
| Admin middleware | `worker/middleware/admin.ts` |
| Audit logger | `worker/lib/audit-log.ts` + auto-audit middleware in `worker/routes/admin/index.ts` |
