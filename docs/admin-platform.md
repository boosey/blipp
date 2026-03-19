# Admin Platform

The admin platform is a full internal dashboard for managing the Blipp podcast briefing system. It uses the "Moonchild" design system — a dark navy theme with modern UI components built on shadcn/ui and Tailwind CSS v4.

## Design System (Moonchild)

| Token | Value |
|-------|-------|
| Background | `#0A1628` (dark navy) |
| Cards | `#1A2942` |
| Accents | `#3B82F6` (blue) |
| Font | Inter |

22+ shadcn/ui components installed. All pages lazy-loaded via `React.lazy()` in `App.tsx`.

## Auth

- **Database**: `User.isAdmin` boolean field
- **Middleware**: `worker/middleware/admin.ts` — `requireAdmin` checks Clerk auth (401) then `isAdmin` (403)
- **Route guard**: Applied globally to all `/api/admin/*` routes via `adminRoutes.use("*", requireAdmin)`
- **Frontend guard**: `src/components/admin-guard.tsx` checks admin status before rendering
- **API client**: `src/lib/admin-api.ts` — `useAdminFetch()` hook attaches Clerk Bearer token automatically

## Pages

### 1. Command Center (`/admin/command-center`)

System health overview. Stat cards for podcasts, users, episodes, and briefings with 7-day trends. Recent pipeline activity feed, active issues list, cost summary, and feed refresh status.

### 2. Pipeline (`/admin/pipeline`)

Pipeline job browser with filters (stage, status, requestId, search). Job detail view with step timeline. Stage aggregate stats. Manual triggers: feed refresh, per-stage, per-episode. Bulk retry for failed jobs.

### 3. Catalog (`/admin/catalog`)

Podcast management: searchable/filterable/sortable list with feed health monitoring. Add, edit, and archive podcasts. Clicking a podcast opens a wide detail modal with podcast info, stats, and action buttons. Episodes are shown in an accordion list; expanding an episode reveals Overview (metadata, cost, transcript/audio links) and Clips tabs. The Clips tab shows each clip with duration tier, status, inline audio player, and expandable feed items with request traceability. Trigger feed refresh per podcast.

### 4. Briefings (`/admin/briefings`)

Briefing list with filters (user, status, sort). Each briefing card shows user info, clip status, duration tier, actual seconds, podcast/episode info, and feed item count. Briefing detail shows clip metadata (podcast image, episode/podcast title, duration stats), audio link, ad audio section (if present), and linked feed items table.

### 5. Users (`/admin/users`)

User management with segments: all, power users, at risk, trial ending, never active. User list with badges. User detail showing subscriptions and recent feed items (activity tab). Admin toggle and plan management.

### 6. Plans (`/admin/plans`)

Plan CRUD management. List all plans with user counts (paginated/sortable). Create new plans with slug, limits (briefingsPerWeek, maxDurationMinutes, maxPodcastSubscriptions), feature flags (adFree, priorityProcessing, earlyAccess, researchMode, crossPodcastSynthesis), billing (monthly/annual pricing, Stripe price IDs, trial days), and display settings (features list, highlighted, sortOrder, isDefault). Soft delete (deactivate) plans that have no active users.

### 7. Analytics (`/admin/analytics`)

Four analytics views:

- **Costs** — Daily cost chart by stage, period comparison, per-model cost breakdown
- **Usage** — Feed item/episode/user trends, tier distribution, peak times
- **Quality** — Time-fitting accuracy, claim coverage, transcription coverage, daily trend
- **Pipeline** — Throughput, success rates, processing speed, bottlenecks

### 8. Configuration (`/admin/configuration`)

Runtime config editor grouped by prefix. Pipeline controls panel. Duration tier config. Subscription tier management. Feature flags with rollout percentage and tier-based controls.

### 9. Requests (`/admin/requests`)

BriefingRequest browser with status filter. Request detail with per-job, per-step progress tree including WorkProduct links. Work product preview (text/JSON content, audio metadata). Test briefing creation dialog with episode picker.

### 10. STT Benchmark (`/admin/stt-benchmark`)

STT model benchmarking system. Create experiments comparing multiple STT models/providers across episodes at different playback speeds. Episode picker filters to episodes with official transcripts (for WER comparison ground truth). Experiment runner executes tasks one at a time (frontend-driven polling). Results grid showing WER, cost, and latency per model/provider/speed combination. Winner detection for best WER, cost, and latency. Transcript diff viewer for comparing hypothesis vs reference text. Audio proxy for CORS-free playback. R2 storage for speed-adjusted audio and transcripts. Supports async providers (AssemblyAI, Google) with polling.

### 11. Model Registry (`/admin/model-registry`)

AI model management. Browse all models by stage (stt, distillation, narrative, tts). Add new models with developer and notes. Add/edit/remove providers per model with pricing metadata (per-minute, per-token, per-character). Toggle model active state and provider availability. Set default providers. View pricing update timestamps.

### 12. Prompt Management (`/admin/prompt-management`)

View and edit all LLM prompts used in the pipeline. Prompts are stored as PlatformConfig entries with hardcoded defaults as fallback. Each prompt has an expandable textarea editor, "customized" badge if overridden, "unsaved" indicator for pending changes, Save button, and Reset to Default. Grouped by pipeline stage (Distillation, Narrative Generation). Changes take effect within 60 seconds (config cache TTL). The narrative user prompt template supports `{{variable}}` syntax for runtime substitution. All changes are audit-logged.

## API Routes

All routes are mounted at `/api/admin/`. Backend route files live in `worker/routes/admin/`.

| Module | Mount | Key Endpoints |
|--------|-------|---------------|
| dashboard | `/dashboard` | `GET /` (health overview), `GET /stats`, `GET /activity`, `GET /costs`, `GET /issues`, `GET /feed-refresh-summary` |
| pipeline | `/pipeline` | `GET /jobs` (paginated), `GET /jobs/:id`, `POST /jobs/:id/retry`, `POST /jobs/bulk/retry`, `POST /trigger/feed-refresh`, `POST /trigger/stage/:stage`, `POST /trigger/episode/:id`, `GET /stages` |
| podcasts | `/podcasts` | `GET /stats`, `GET /` (paginated), `GET /:id`, `POST /` (create), `PATCH /:id`, `DELETE /:id` (archive), `POST /:id/refresh` |
| episodes | `/episodes` | `GET /` (paginated), `GET /:id`, `POST /:id/reprocess` |
| briefings | `/briefings` | `GET /` (paginated), `GET /:id` |
| users | `/users` | `GET /segments`, `GET /` (paginated), `GET /:id`, `PATCH /:id` |
| analytics | `/analytics` | `GET /costs`, `GET /costs/by-model`, `GET /usage`, `GET /quality`, `GET /pipeline` |
| config | `/config` | `GET /` (all configs), `PATCH /:key`, `GET /tiers/duration`, `PUT /tiers/duration`, `GET /tiers/subscription`, `PUT /tiers/subscription`, `GET /features`, `PUT /features/:id` |
| requests | `/requests` | `GET /` (paginated), `GET /:id`, `GET /work-product/:id/preview`, `GET /work-product/:id/audio`, `POST /test-briefing` |
| plans | `/plans` | `GET /` (paginated), `GET /:id`, `POST /` (create), `PATCH /:id` (update), `DELETE /:id` (soft delete) |
| stt-benchmark | `/stt-benchmark` | `GET /eligible-episodes`, `GET /episode-audio/:id`, `POST /experiments`, `GET /experiments`, `GET /experiments/:id`, `POST /experiments/:id/run`, `POST /experiments/:id/cancel`, `GET /experiments/:id/results`, `DELETE /experiments/:id`, `POST /upload-audio`, `GET /results/:id/transcript`, `GET /results/:id/reference-transcript`, `GET /episodes/:episodeId/reference-transcript` |
| ai-models | `/ai-models` | `GET /` (list), `POST /` (create), `PATCH /:id`, `POST /:id/providers`, `PATCH /:id/providers/:providerId`, `DELETE /:id/providers/:providerId` |

## File Map

| Category | Path |
|----------|------|
| Pages | `src/pages/admin/*.tsx` (11 files) |
| Layout | `src/layouts/admin-layout.tsx` |
| Guard | `src/components/admin-guard.tsx` |
| API hook | `src/lib/admin-api.ts` |
| Types | `src/types/admin.ts` |
| Backend routes | `worker/routes/admin/*.ts` (12 files) |
| Admin middleware | `worker/middleware/admin.ts` |
