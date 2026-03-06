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

Podcast management: searchable/filterable/sortable list with feed health monitoring. Add, edit, and archive podcasts. Per-podcast episode list with pipeline status. Trigger feed refresh per podcast.

### 4. Episodes (`/admin/episodes`)

Episode browser with search, filter, and sort. Pipeline status per episode. Episode detail view showing distillation, clips, briefing appearances, and full pipeline trace. Reprocess trigger.

### 5. Briefings (`/admin/briefings`)

Briefing list with filters (user, status, sort). Quality metrics including time-fit accuracy and segment balance. Briefing detail with segment breakdown.

### 6. Users (`/admin/users`)

User management with segments: all, power users, at risk, trial ending, never active. User list with badges. User detail showing subscriptions and recent briefings. Admin toggle and tier management.

### 7. Analytics (`/admin/analytics`)

Four analytics views:

- **Costs** — Daily cost chart by stage, period comparison
- **Usage** — Briefing/episode/user trends, tier distribution, peak times
- **Quality** — Time-fitting accuracy, claim coverage, transcription coverage, daily trend
- **Pipeline** — Throughput, success rates, processing speed, bottlenecks

### 8. Configuration (`/admin/configuration`)

Runtime config editor grouped by prefix. Pipeline controls panel. Duration tier config. Subscription tier management. Feature flags with rollout percentage and tier-based controls.

### 9. Requests (`/admin/requests`)

BriefingRequest browser with status filter. Request detail with per-job, per-step progress tree including WorkProduct links. Work product preview (text/JSON content, audio metadata). Test briefing creation dialog with episode picker.

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
| analytics | `/analytics` | `GET /costs`, `GET /usage`, `GET /quality`, `GET /pipeline` |
| config | `/config` | `GET /` (all configs), `PATCH /:key`, `GET /tiers/duration`, `PUT /tiers/duration`, `GET /tiers/subscription`, `PUT /tiers/subscription`, `GET /features`, `PUT /features/:id` |
| requests | `/requests` | `GET /` (paginated), `GET /:id`, `GET /work-product/:id/preview`, `GET /work-product/:id/audio`, `POST /test-briefing` |

## File Map

| Category | Path |
|----------|------|
| Pages | `src/pages/admin/*.tsx` (9 files) |
| Layout | `src/layouts/admin-layout.tsx` |
| Guard | `src/components/admin-guard.tsx` |
| API hook | `src/lib/admin-api.ts` |
| Types | `src/types/admin.ts` |
| Backend routes | `worker/routes/admin/*.ts` (9 files) |
| Admin middleware | `worker/middleware/admin.ts` |
