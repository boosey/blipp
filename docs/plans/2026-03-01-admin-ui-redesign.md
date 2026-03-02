# Blipp Admin Platform - Full UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the complete admin platform with 17 screen designs from the Moonchild design system - a mission control experience for operating the Blipp podcast intelligence platform.

**Architecture:** Dark-themed admin UI built with React 19 + shadcn/ui + Tailwind v4, backed by Hono API routes on Cloudflare Workers. Admin auth via Clerk `isAdmin` flag + `requireAdmin` middleware. All data from Prisma/Neon PostgreSQL.

**Tech Stack:** React 19, React Router 7, shadcn/ui, Tailwind v4, Lucide icons, Recharts, Hono, Prisma 7, Clerk, Cloudflare Workers

**Design Reference:** `docs/plans/moonchild-designs/admin Platform Imp.pdf` (48 pages) + 17 HTML screen mockups in same directory.

**Design System Colors:**
- Background: `#0A1628` | Card/Panel: `#1A2942` | Text: `#F9FAFB` | Secondary: `#9CA3AF`
- Success: `#10B981` | Warning: `#F59E0B` | Error: `#EF4444` | Info/Action: `#3B82F6`
- AI/Model: `#8B5CF6` | User/People: `#14B8A6` | Config: `#F97316`
- Font: Inter (headings bold, body regular) | Monospace: Roboto Mono

---

## Phase 0: Foundation (BLOCKING - must complete before parallel work)

### Task 0A: Install dependencies

```bash
npm install lucide-react recharts @tanstack/react-table clsx tailwind-merge class-variance-authority --legacy-peer-deps
npx shadcn@latest init
# When prompted: TypeScript, tailwind css, default style, slate color, src/index.css, yes CSS variables, @/components, @/lib, no RSC, yes write components.json
npx shadcn@latest add button card input table badge tabs dialog dropdown-menu separator sheet tooltip select checkbox label textarea switch popover command scroll-area avatar skeleton alert --legacy-peer-deps
```

### Task 0B: Prisma schema updates

**File:** `prisma/schema.prisma`

Add to User model:
```prisma
isAdmin Boolean @default(false)
```

Add new models:
```prisma
model PipelineJob {
  id           String          @id @default(cuid())
  type         PipelineJobType
  status       PipelineJobStatus @default(PENDING)
  entityId     String          // podcastId or episodeId or briefingId
  entityType   String          // "podcast" | "episode" | "briefing"
  stage        Int             // 1-5 pipeline stage
  input        Json?
  output       Json?
  errorMessage String?
  cost         Float?          // estimated cost in dollars
  startedAt    DateTime?
  completedAt  DateTime?
  durationMs   Int?
  retryCount   Int             @default(0)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}

enum PipelineJobType {
  FEED_REFRESH
  TRANSCRIPTION
  DISTILLATION
  CLIP_GENERATION
  BRIEFING_ASSEMBLY
}

enum PipelineJobStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
  RETRYING
}

model PlatformConfig {
  id          String   @id @default(cuid())
  key         String   @unique
  value       Json
  description String?
  updatedAt   DateTime @updatedAt
  updatedBy   String?  // admin clerkId
}
```

Add to Podcast model:
```prisma
feedHealth   String?  // "excellent" | "good" | "fair" | "poor" | "broken"
feedError    String?
episodeCount Int      @default(0)
status       String   @default("active") // "active" | "paused" | "archived"
```

Run: `npx prisma migrate dev --name add-admin-models`

### Task 0C: Shared type contracts

**Create:** `src/types/admin.ts`

All TypeScript types shared between frontend and backend admin. Types for:
- Dashboard stats (KPIs, health, activity feed)
- Pipeline jobs (list, detail, stage stats)
- Catalog podcasts (list with filters, detail with episodes)
- Episodes (list with pipeline status, detail with trace)
- Briefings (list with quality metrics, detail with segments)
- Users (list with segments, detail with tabs)
- Analytics (cost breakdown, usage trends, quality metrics, pipeline performance)
- Configuration (AI models, duration tiers, subscription tiers, prompts, feature flags)
- Common: pagination, filters, sort, API responses

### Task 0D: Admin auth middleware

**Create:** `worker/middleware/admin.ts`

```typescript
import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

export const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const auth = getAuth(c);
    if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

    const prisma = createPrismaClient(c.env.HYPERDRIVE);
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        select: { isAdmin: true },
      });
      if (!user?.isAdmin) return c.json({ error: "Forbidden" }, 403);
      await next();
    } finally {
      c.executionCtx.waitUntil(prisma.$disconnect());
    }
  }
);
```

### Task 0E: Admin API client hook

**Create:** `src/lib/admin-api.ts`

Extends the existing `useApiFetch` pattern with admin-specific prefix `/admin/`:
- `useAdminFetch()` - hook returning a fetcher bound to `/api/admin/*`
- Standard GET/POST/PATCH/DELETE helpers

### Task 0F: Admin layout shell

**Create:** `src/layouts/admin-layout.tsx`

Dark sidebar layout matching design system:
- 64px top bar with Blipp logo, search, notifications bell, admin avatar
- 240px collapsible sidebar with navigation items:
  - Command Center (Home icon)
  - Pipeline (GitBranch icon)
  - Catalog (Library icon)
  - Episodes (Disc icon)
  - Briefings (Radio icon)
  - Users (Users icon)
  - Analytics (BarChart3 icon)
  - Configuration (Settings icon)
- Active item highlighted with blue left border + blue bg
- Main content area with `<Outlet />`
- Background: `#0A1628`, sidebar: `#0F1D32`

### Task 0G: Admin router setup

**Modify:** `src/App.tsx`

Add admin routes under `/admin/*` with admin layout wrapper:
```tsx
<Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
  <Route index element={<Navigate to="command-center" />} />
  <Route path="command-center" element={<CommandCenter />} />
  <Route path="pipeline" element={<Pipeline />} />
  <Route path="catalog" element={<Catalog />} />
  <Route path="episodes" element={<Episodes />} />
  <Route path="briefings" element={<Briefings />} />
  <Route path="users" element={<Users />} />
  <Route path="analytics" element={<Analytics />} />
  <Route path="configuration" element={<Configuration />} />
</Route>
```

### Task 0H: Mount admin routes on backend

**Create:** `worker/routes/admin/index.ts`
**Modify:** `worker/routes/index.ts` — add `routes.route("/admin", adminRoutes);`

Admin router applies `requireAdmin` middleware to all sub-routes, then mounts:
- `/admin/dashboard` — dashboard routes
- `/admin/pipeline` — pipeline routes
- `/admin/podcasts` — catalog routes
- `/admin/episodes` — episode routes
- `/admin/briefings` — briefing routes
- `/admin/users` — user routes
- `/admin/analytics` — analytics routes
- `/admin/config` — configuration routes

### Task 0I: Tailwind design tokens

**Modify:** `src/index.css`

Add custom CSS variables for the admin design system colors, then reference them in Tailwind v4 `@theme` block.

---

## Phase 1: Backend API Routes (parallelizable)

### Task 1A: Dashboard API routes

**Create:** `worker/routes/admin/dashboard.ts`

Endpoints:
- `GET /health` — System health (pipeline stage completion rates, active issues count)
- `GET /stats` — Quick stats (total podcasts, users, episodes, briefings + trends)
- `GET /activity` — Recent pipeline events (last 20), ordered by timestamp
- `GET /costs` — Today's spend, breakdown by category, comparison to yesterday
- `GET /issues` — Active issues requiring attention (failed jobs, broken feeds)

### Task 1B: Pipeline API routes

**Create:** `worker/routes/admin/pipeline.ts`

Endpoints:
- `GET /jobs` — Paginated job list with filters (stage, status, dateRange), sort
- `GET /jobs/:id` — Job detail with full trace across all 5 stages
- `POST /jobs/:id/retry` — Retry a failed job
- `POST /jobs/bulk/retry` — Bulk retry with array of job IDs
- `GET /stages` — Per-stage stats (active jobs, success rate, avg time, cost)

### Task 1C: Catalog/Podcasts API routes

**Create:** `worker/routes/admin/podcasts.ts`

Endpoints:
- `GET /` — Paginated podcast list with filters (health, status, transcript, activity, categories), search, sort
- `GET /:id` — Podcast detail with episodes, stats, subscription data, pipeline activity
- `POST /` — Add new podcast (validate RSS URL, fetch metadata preview)
- `PATCH /:id` — Update podcast (status, metadata)
- `DELETE /:id` — Remove podcast
- `POST /:id/refresh` — Trigger manual feed refresh
- `GET /stats` — Catalog aggregate stats (total, by health, by status)

### Task 1D: Episodes API routes

**Create:** `worker/routes/admin/episodes.ts`

Endpoints:
- `GET /` — Paginated episode list with filters (pipeline status, podcast, date), sort
- `GET /:id` — Episode detail with full pipeline trace (distillation, clips, briefing appearances)
- `POST /:id/reprocess` — Re-trigger processing from a specific stage

### Task 1E: Briefings API routes

**Create:** `worker/routes/admin/briefings.ts`

Endpoints:
- `GET /` — Paginated briefing list with filters (status, user, date), sort
- `GET /:id` — Briefing detail with segments, quality metrics, user context
- `POST /preview` — Generate a preview briefing (for QA, not delivered to user)

### Task 1F: Users API routes

**Create:** `worker/routes/admin/users.ts`

Endpoints:
- `GET /` — Paginated user list with filters (tier, status, segment), search, sort
- `GET /:id` — User detail (account, subscriptions, briefings, billing, activity)
- `PATCH /:id` — Update user (tier change, admin notes)
- `GET /segments` — User segment counts (power users, at risk, trial ending, etc.)

### Task 1G: Analytics API routes

**Create:** `worker/routes/admin/analytics.ts`

Endpoints:
- `GET /costs` — Cost breakdown over time with category layers
- `GET /usage` — Usage trends (briefings, episodes, users, duration)
- `GET /quality` — Quality metrics (time-fitting, transcription, satisfaction)
- `GET /pipeline` — Pipeline performance (throughput, latency, success rates, bottlenecks)

### Task 1H: Configuration API routes

**Create:** `worker/routes/admin/config.ts`

Endpoints:
- `GET /` — All configuration grouped by category
- `PATCH /:key` — Update a config value
- `GET /tiers/duration` — Duration tier configuration
- `PUT /tiers/duration` — Update duration tiers
- `GET /tiers/subscription` — Subscription tier configuration
- `PUT /tiers/subscription` — Update subscription tiers
- `GET /features` — Feature flags
- `PUT /features/:id` — Toggle feature flag

---

## Phase 2: Frontend Screens (parallelizable after Phase 0)

### Task 2A: Screen 14 - Command Center (Dashboard)

**Create:** `src/pages/admin/command-center.tsx`
**Reference:** `14-blipp-admin---command-center.html` (refined version) + `01-blipp-admin---command-center.html`

Three-column layout (5:3:2):
- **Left:** System Health panel (overall status + 5 pipeline stage health bars, color-coded) + Pipeline Pulse (live feed of last 20 events with timestamps, stage badges, status)
- **Center:** Active Issues (prioritized by severity with retry/dismiss actions) + Recent Activity feed
- **Right:** Cost Monitor (today's spend, sparkline, pie chart breakdown, budget bar) + Quick Stats grid (podcasts, users, episodes, briefings with trend arrows)

### Task 2B: Screen 10 - Pipeline Flow

**Create:** `src/pages/admin/pipeline.tsx`
**Reference:** `10-blipp-admin---pipeline-flow.html` + `04-blipp-admin--pipeline-control-center.html`

Full-width horizontal flow with 5 stage columns:
- Each column: stage number badge, name, icon, stats (active jobs, success rate, avg time, cost)
- Job cards within each column (scrollable, 50 per load)
- Stage-specific job card content (see design doc p.7)
- Animated SVG flow arrows between stages
- Job details panel (right sidebar) with tabs: Overview, Pipeline Trace, Logs, Actions

### Task 2C: Screen 17 - Catalog

**Create:** `src/pages/admin/catalog.tsx`
**Reference:** `17-blipp-admin---catalog.html` + `03-catalog---blipp-admin.html`

Three-column layout (280px filter sidebar : flex : 360px detail panel):
- **Filter Sidebar:** Feed health chart, status radio buttons, transcript availability, activity, categories multi-select, saved filter sets
- **Main Content:** Toggleable grid/list/health views
  - Grid: 4-col cards with artwork, health score, stats
  - List: Dense table with sortable columns, inline editing
  - Health: Grouped by status with suggested actions
- **Details Panel:** Artwork, title, RSS URL, health metrics, episode summary, subscription data, pipeline activity, quick actions
- **Add Podcast modal:** RSS URL input, validation, metadata preview, cost estimate

### Task 2D: Screen 16 - Episodes

**Create:** `src/pages/admin/episodes.tsx`
**Reference:** `16-blipp-admin---episodes.html` + `08-episodes---blipp-admin.html`

Master-detail split (60/40):
- **Episode Table:** Columns for Title, Podcast, Published, Duration, Pipeline Status, Clips, Cost, Updated, Actions. Color-coded left border by status. Row height 48px. Inline indicators for transcript source, cache hits, quality issues.
- **Details Panel Tabs:**
  - Overview: Artwork, title, external links, status, stats, metadata, quick actions
  - Pipeline Trace: Vertical timeline with 5 stage nodes (expandable details per stage)
  - Clips: Full-width view of all clips with audio players, metadata
  - Logs: Technical log viewer with search, filters

### Task 2E: Screen 15 - Briefings

**Create:** `src/pages/admin/briefings.tsx`
**Reference:** `15-blipp-admin---briefings.html` + `07-blipp-admin---briefings.html`

Three-column layout (320px : flex : 360px):
- **Briefing List:** Card format showing user email, tier badge, digest name, timestamp, duration, fit accuracy, podcast count, status, play count. Failed briefings highlighted red.
- **Audio Player (Center):** Full-width waveform visualization (160px height) with color-coded sections per podcast. Playback controls (play/pause, skip ±15s, speed, volume, download).
- **Segment Breakdown:** List of segment cards with podcast artwork, episode title, clip duration, transition text. Currently playing segment highlighted.
- **User Context Panel:** Email, tier, subscription details, digest config, briefing generation timeline, history stats
- **Quality Metrics Panel:** Time-fitting accuracy gauge, content coverage bar, segment balance chart, transition quality score

### Task 2F: Screen 12 - Users

**Create:** `src/pages/admin/users.tsx`
**Reference:** `12-blipp-admin---users.html` + `02-users--blipp-admin.html`

Master-detail split (40/60):
- **User Table:** Columns for Email, Name, Tier Badge, Status, Signup Date, Last Active, Briefings count, Actions. Color-coded left border by tier. Row badges for At Risk, Power User, Trial, Anniversary.
- **User Segments (Quick Filters):** Pill buttons for All Users, Power Users (>50/week), At Risk, Trial Ending Soon, Recently Cancelled, Never Active
- **Details Panel Tabs:**
  - Overview: Account info, subscription details, usage stats, top podcasts, recent activity, support tools, admin notes
  - Briefings: Table with filters, analytics chart, failed briefings alert
  - Digests: User's configured digests (expandable cards) with edit capabilities
  - Billing: Subscription overview, transaction history, lifetime value, admin actions (credit, refund, extend trial)
  - Activity: Chronological feed with filters (date range, action type, source), search, export

### Task 2G: Screen 11 - Analytics

**Create:** `src/pages/admin/analytics.tsx`
**Reference:** `11-blipp-admin---analytics.html` + `09-analytics---blipp-admin.html`

Responsive dashboard grid (2x2 default) with global date range picker:
- **Cost Breakdown widget:** Total cost (large), comparison to previous period, stacked area chart by category (STT/Distillation/TTS/Infrastructure), key metrics (per episode, daily avg, projected monthly, budget status), efficiency gauge
- **Usage Trends widget:** Key metrics grid (briefings, episodes, users, avg duration), line chart, usage by tier (pie chart), peak usage times (bar chart), most popular podcasts
- **Quality Metrics widget:** Overall quality score (radial gauge), component scores (time-fitting, claim coverage, transcription, user satisfaction), quality trend line, recent issues histogram
- **Pipeline Performance widget:** Throughput metrics (episodes/hour), success rates by stage (pie chart), processing speed trend, bottleneck detection with recommendations

### Task 2H: Screen 13 - Configuration

**Create:** `src/pages/admin/configuration.tsx`
**Reference:** `13-blipp-admin---configuration.html` + `06-configuration---blipp-admin.html`

Left sidebar (240px) with categories + main content area:
- **AI Models:** STT, Distillation, Narrative, TTS config panels (provider/model selection, settings, cost comparison, test button)
- **Duration Tiers:** Visual timeline, add/remove/edit tiers, cache analysis (heat map, hit rate, cost savings)
- **Subscription Tiers:** Card-based management (create/edit tiers with pricing, limits, features)
- **Pipeline Settings:** Processing defaults, retry policies, queue configuration
- **Prompts:** Distillation, Narrative, Transitions (code editor, version control, A/B testing)
- **Quality Thresholds:** Claim importance cutoffs, time-fitting tolerance, feed health scoring
- **Cost Controls:** Budget alerts, rate limits, optimization rules
- **Feature Flags:** Toggle features (Research Mode, Discover Mode, etc.) with rollout percentage, tier availability

### Task 2I: Screen 05 - Users & Analytics combined

**Create:** `src/pages/admin/users-analytics.tsx` (or integrate into users page as a tab)
**Reference:** `05-blipp-admin---users--analytics.html`

User engagement analytics view combining user table with engagement metrics.

---

## Phase 3: Integration & Polish

### Task 3A: Wire all routes together
- Verify all admin routes are mounted
- Test API endpoints with curl/fetch
- Ensure admin guard works (non-admin gets 403)

### Task 3B: Admin seed data
- Add a seed script to set `isAdmin: true` on the dev user
- Seed sample PipelineJob records for development

### Task 3C: Commit and verify
- Run `npm run typecheck`
- Run `npm run build`
- Fix any TypeScript errors
- Commit all changes

---

## Team Assignment

This plan is designed for Agent Team execution:

| Agent | Phase 0 (blocking) | Phase 1 | Phase 2 |
|-------|-------------------|---------|---------|
| **Lead** | Tasks 0A-0I | Coordinate | Coordinate + 3A-3C |
| **Backend** | — (blocked) | Tasks 1A-1H | — |
| **Frontend-1** | — (blocked) | — | Tasks 2A, 2B, 2C, 2D |
| **Frontend-2** | — (blocked) | — | Tasks 2E, 2F, 2G, 2H, 2I |

Phase 0 MUST complete before Phase 1 and 2 can start (shared types + schema).
Phase 1 and Phase 2 run in parallel.
Phase 3 runs after both complete.
