# Pipeline UI Redesign — Design Document

## Problem

Feed refresh (stage 1) doesn't create PipelineJob records — it upserts episodes directly. This means the Pipeline page's stage 1 column is always empty. Feed refresh is a pre-pipeline ingestion step, not a demand-driven pipeline stage. The Pipeline page should reflect the actual demand-driven pipeline (stages 2-5) and provide real-time queue visibility.

## Design

### 1. Pipeline Page Layout

**Remove stage 1 column.** The page becomes a 4-column kanban view:

```
[Transcription] → [Distillation] → [Clip Generation] → [Briefing Assembly]
     Stage 2          Stage 3           Stage 4              Stage 5
```

**Summary bar** below the toolbar replaces the "New Jobs" concept:

```
[Queued: 12] [Processing: 3] [Completed today: 47] [Failed: 2]
```

Each badge is clickable — filters all columns to show only that status.

**Toolbar changes:**
- Remove "Run Feed Refresh" button (moves to Command Center/Catalog)
- Keep: Pipeline master toggle, request filter dropdown, Refresh button

**Stage columns (stages 2-5):**
- `STAGE_META` drops stage 1, becomes 4 entries
- Stage headers gain a **queue depth badge** (e.g., "3 queued") next to the stage name
- Jobs sorted within each column: IN_PROGRESS first, PENDING next, then COMPLETED, then FAILED
- Job cards unchanged (episode title, podcast, status badge, timing, cost)

**Pipeline Trace** in detail sheet updated to start at stage 2.

### 2. Enhanced Detail Sheet for Queued Jobs

When clicking a PENDING (queued) job, the detail sheet shows rich context:

**Overview tab — "Why is this job here?" context:**
- Which BriefingRequest created it (user email, request time, target minutes)
- Episode info (title, podcast, published date, audio URL)
- Upstream stage progress (e.g., "Transcription: completed, Distillation: waiting")
- Queue position (number of PENDING jobs ahead in this stage)

**Actions tab for queued jobs:**
- "Cancel" — remove job from queue before processing starts (sets status to CANCELLED or deletes)
- "View Request" — link/navigate to the parent BriefingRequest

The detail sheet already handles IN_PROGRESS, COMPLETED, and FAILED jobs well — this adds PENDING-specific context.

### 3. Feed Refresh Summary Card

New `FeedRefreshCard` component — compact summary card on Command Center and Catalog.

**Data source:** New endpoint `GET /admin/dashboard/feed-refresh-summary`:

```typescript
interface FeedRefreshSummary {
  lastRunAt: string | null;        // MAX(podcast.lastFetchedAt)
  podcastsRefreshed: number;       // podcasts fetched in last run window
  totalPodcasts: number;           // total active podcasts
  recentEpisodes: number;          // episodes created in last 24h
  feedErrors: number;              // podcasts with feedError set
}
```

**Card layout** (compact, dark theme):

```
┌─ Feed Refresh ──────────────────────┐
│ Last run: 32m ago    ⟳ Refresh Now  │
│ 198/200 podcasts · 47 new episodes  │
│ 2 feed errors                       │
└─────────────────────────────────────┘
```

**Placement:**
- **Command Center**: In the stats/activity area
- **Catalog**: Above the podcast grid as a status bar

"Refresh Now" button triggers existing `POST /pipeline/trigger/feed-refresh`.

### 4. Type & Backend Changes

**Types (`src/types/admin.ts`):**
- Add `FeedRefreshSummary` interface
- Remove `"FEED_REFRESH"` from `PipelineJobType` (never created anyway)

**Frontend constants:**
- `STAGE_META` in pipeline page → 4 entries (stages 2-5)
- `STAGE_NAMES` in command-center → drop "Feed Refresh"
- Pipeline Trace → iterate stages 2-5

**Backend routes (`worker/routes/admin/pipeline.ts`):**
- `/stages` returns stages 2-5 only
- `/trigger/stage/1` returns 400 with "Use /trigger/feed-refresh instead"
- Job detail endpoint enriched: when job has `requestId`, return parent BriefingRequest context
- Queue position: `COUNT(PipelineJob WHERE stage = N AND status = 'PENDING' AND createdAt < job.createdAt)`

**New endpoint (`worker/routes/admin/dashboard.ts`):**
- `GET /dashboard/feed-refresh-summary` — queries podcast/episode tables for summary stats

## What Doesn't Change

- All queue handlers (feed-refresh, transcription, distillation, clip-gen, briefing-assembly, orchestrator)
- Local queue shim
- Pipeline logging
- Job retry/bulk-retry endpoints
- Per-episode trigger endpoint
- PipelineControls component (stage toggles still work for stages 2-5)
- Prisma schema (no migrations needed)
