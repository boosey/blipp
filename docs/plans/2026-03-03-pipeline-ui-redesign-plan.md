# Pipeline UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Pipeline page to remove feed refresh (stage 1) and show a 4-column queue view (stages 2-5) with enhanced PENDING job details, plus add feed refresh summary cards to Command Center and Catalog.

**Architecture:** Frontend-heavy refactor of `pipeline.tsx`, new `FeedRefreshCard` shared component, backend additions for feed refresh summary and enriched job details. No schema changes.

**Tech Stack:** React 19, Hono, Prisma 7, shadcn/ui, Tailwind v4, Vitest

---

### Task 1: Shared Types — Add FeedRefreshSummary, update PipelineJobType

**Files:**
- Modify: `src/types/admin.ts`

**Step 1: Update types**

In `src/types/admin.ts`:
- Add `FeedRefreshSummary` interface:
  ```typescript
  export interface FeedRefreshSummary {
    lastRunAt: string | null;
    podcastsRefreshed: number;
    totalPodcasts: number;
    recentEpisodes: number;
    feedErrors: number;
  }
  ```
- Remove `"FEED_REFRESH"` from `PipelineJobType` union
- Add `EnrichedPipelineJob` extending `PipelineJob` with optional request context:
  ```typescript
  export interface PipelineJobRequestContext {
    requestId: string;
    userId: string;
    userEmail?: string;
    targetMinutes: number;
    status: BriefingRequestStatus;
    createdAt: string;
  }

  export interface EnrichedPipelineJob extends PipelineJob {
    requestContext?: PipelineJobRequestContext;
    queuePosition?: number;
    upstreamProgress?: {
      stage: number;
      name: string;
      status: "COMPLETED" | "IN_PROGRESS" | "PENDING" | "FAILED";
    }[];
  }
  ```

**Step 2: Commit**

```bash
git add src/types/admin.ts
git commit -m "feat: add FeedRefreshSummary type and EnrichedPipelineJob for queue context"
```

---

### Task 2: Backend — Feed refresh summary endpoint

**Files:**
- Modify: `worker/routes/admin/dashboard.ts`

**Step 1: Add feed-refresh-summary endpoint**

Add `GET /feed-refresh-summary` to the dashboard routes:

```typescript
dashboardRoutes.get("/feed-refresh-summary", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [lastFetched, totalPodcasts, recentEpisodes, feedErrors] = await Promise.all([
      prisma.podcast.aggregate({ _max: { lastFetchedAt: true }, where: { status: "active" } }),
      prisma.podcast.count({ where: { status: "active" } }),
      prisma.episode.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.podcast.count({ where: { feedError: { not: null }, status: "active" } }),
    ]);

    const lastRunAt = lastFetched._max.lastFetchedAt;
    // Count podcasts refreshed in the same window as the last run (within 10 minutes)
    const podcastsRefreshed = lastRunAt
      ? await prisma.podcast.count({
          where: { lastFetchedAt: { gte: new Date(lastRunAt.getTime() - 10 * 60 * 1000) } },
        })
      : 0;

    return c.json({
      data: {
        lastRunAt: lastRunAt?.toISOString() ?? null,
        podcastsRefreshed,
        totalPodcasts,
        recentEpisodes,
        feedErrors,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

**Step 2: Commit**

```bash
git add worker/routes/admin/dashboard.ts
git commit -m "feat: add feed-refresh-summary endpoint"
```

---

### Task 3: Backend — Enriched job detail with request context and queue position

**Files:**
- Modify: `worker/routes/admin/pipeline.ts`

**Step 1: Enrich GET /jobs/:id**

When a job has a `requestId`, fetch the parent BriefingRequest and user info. Also compute queue position for PENDING jobs and upstream stage progress for the episode.

Add to the existing `/jobs/:id` handler after fetching the job:

```typescript
// Enrich with request context if available
let requestContext = undefined;
if (job.requestId) {
  const request = await prisma.briefingRequest.findUnique({
    where: { id: job.requestId },
    include: { user: { select: { email: true } } },
  });
  if (request) {
    requestContext = {
      requestId: request.id,
      userId: request.userId,
      userEmail: request.user?.email,
      targetMinutes: request.targetMinutes,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    };
  }
}

// Queue position for PENDING jobs
let queuePosition = undefined;
if (job.status === "PENDING") {
  queuePosition = await prisma.pipelineJob.count({
    where: { stage: job.stage, status: "PENDING", createdAt: { lt: job.createdAt } },
  });
}

// Upstream progress for episode jobs
let upstreamProgress = undefined;
if (job.entityType === "episode") {
  const relatedJobs = await prisma.pipelineJob.findMany({
    where: { entityId: job.entityId, entityType: "episode" },
    select: { stage: true, status: true },
    orderBy: { stage: "asc" },
  });
  upstreamProgress = [2, 3, 4, 5]
    .filter(s => s <= job.stage)
    .map(s => ({
      stage: s,
      name: STAGE_NAMES[s],
      status: relatedJobs.find(j => j.stage === s)?.status ?? "PENDING",
    }));
}
```

Return `requestContext`, `queuePosition`, and `upstreamProgress` in the response.

**Step 2: Update /stages to return stages 2-5 only**

Change the stage list from `[1, 2, 3, 4, 5]` to `[2, 3, 4, 5]`.

**Step 3: Update /trigger/stage/1 to return a redirect message**

Add early return: `if (stage === 1) return c.json({ error: "Feed refresh is not a pipeline stage. Use POST /trigger/feed-refresh." }, 400);`

(This is already handled differently — stage 1 currently enqueues feed refresh. Change the response to a 400 with guidance.)

**Step 4: Commit**

```bash
git add worker/routes/admin/pipeline.ts
git commit -m "feat: enrich job detail with request context, queue position, upstream progress"
```

---

### Task 4: Frontend — Pipeline page: remove stage 1, add summary bar

**Files:**
- Modify: `src/pages/admin/pipeline.tsx`

**Step 1: Update STAGE_META**

Remove stage 1 entry:
```typescript
const STAGE_META = [
  { stage: 2, name: "Transcription", icon: Mic, color: "#8B5CF6" },
  { stage: 3, name: "Distillation", icon: Sparkles, color: "#F59E0B" },
  { stage: 4, name: "Clip Generation", icon: Scissors, color: "#10B981" },
  { stage: 5, name: "Briefing Assembly", icon: Package, color: "#14B8A6" },
];
```

**Step 2: Add summary bar component**

```typescript
function PipelineSummaryBar({ stageJobs }: { stageJobs: Record<number, PipelineJob[]> }) {
  const allJobs = Object.values(stageJobs).flat();
  const queued = allJobs.filter(j => j.status === "PENDING").length;
  const processing = allJobs.filter(j => j.status === "IN_PROGRESS").length;
  const completed = allJobs.filter(j => j.status === "COMPLETED").length;
  const failed = allJobs.filter(j => j.status === "FAILED").length;

  return (
    <div className="flex items-center gap-2">
      <SummaryBadge label="Queued" count={queued} color="#9CA3AF" />
      <SummaryBadge label="Processing" count={processing} color="#F59E0B" />
      <SummaryBadge label="Completed" count={completed} color="#10B981" />
      <SummaryBadge label="Failed" count={failed} color="#EF4444" />
    </div>
  );
}
```

**Step 3: Sort jobs in columns by status priority**

Add sort to `load()` result processing:
```typescript
const STATUS_ORDER: Record<string, number> = {
  IN_PROGRESS: 0, PENDING: 1, RETRYING: 2, FAILED: 3, COMPLETED: 4,
};
// Sort jobs after fetching
jobs.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
```

**Step 4: Add queue depth badge to StageHeader**

Show pending count prominently in each stage header.

**Step 5: Remove "Run Feed Refresh" button from toolbar**

Remove the button and `triggeringFeedRefresh` state.

**Step 6: Update Pipeline Trace in detail sheet**

Change `STAGE_META.map(...)` in `PipelineDetailSheet` to iterate stages 2-5 only.

**Step 7: Commit**

```bash
git add src/pages/admin/pipeline.tsx
git commit -m "feat: pipeline page 4-column layout with summary bar and queue depth"
```

---

### Task 5: Frontend — Enhanced PENDING job detail sheet

**Files:**
- Modify: `src/pages/admin/pipeline.tsx`

**Step 1: Fetch enriched job data**

When a job is selected and the sheet opens, fetch `/pipeline/jobs/:id` which now returns `requestContext`, `queuePosition`, and `upstreamProgress`.

**Step 2: Add request context to Overview tab**

For PENDING jobs, show:
- Request info card: user email, target minutes, request status, request time
- Queue position: "Position 3 of 7 in Transcription queue"
- Upstream progress: mini timeline showing which prior stages are done

```typescript
{job.status === "PENDING" && enrichedJob?.requestContext && (
  <div className="rounded-md bg-white/[0.03] p-2 space-y-1.5">
    <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">Request</div>
    <div className="text-[11px]">{enrichedJob.requestContext.userEmail}</div>
    <div className="text-[10px] text-[#9CA3AF]">
      {enrichedJob.requestContext.targetMinutes}min briefing · {relativeTime(enrichedJob.requestContext.createdAt)}
    </div>
  </div>
)}
{enrichedJob?.queuePosition != null && (
  <div className="rounded-md bg-white/[0.03] p-2">
    <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">Queue Position</div>
    <div className="text-[11px]">#{enrichedJob.queuePosition + 1} in queue</div>
  </div>
)}
```

**Step 3: Show upstream progress mini-timeline**

Compact horizontal dots showing stage completion status for the episode.

**Step 4: Add "Cancel" action for PENDING jobs**

In the Actions tab, add a Cancel button that sets the job status to FAILED with a cancellation message (or deletes it).

**Step 5: Commit**

```bash
git add src/pages/admin/pipeline.tsx
git commit -m "feat: enhanced detail sheet for queued jobs with request context"
```

---

### Task 6: Frontend — FeedRefreshCard shared component

**Files:**
- Create: `src/components/admin/feed-refresh-card.tsx`

**Step 1: Create FeedRefreshCard component**

```typescript
export function FeedRefreshCard() {
  const apiFetch = useAdminFetch();
  const [summary, setSummary] = useState<FeedRefreshSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    apiFetch<{ data: FeedRefreshSummary }>("/dashboard/feed-refresh-summary")
      .then(r => setSummary(r.data))
      .catch(() => {});
  }, [apiFetch]);

  // ... render compact card with last run, podcasts, episodes, errors, refresh button
}
```

Matches the dark theme (bg-[#1A2942], border-white/5, etc.).

**Step 2: Commit**

```bash
git add src/components/admin/feed-refresh-card.tsx
git commit -m "feat: add FeedRefreshCard shared component"
```

---

### Task 7: Frontend — Add FeedRefreshCard to Command Center

**Files:**
- Modify: `src/pages/admin/command-center.tsx`

**Step 1: Import and place FeedRefreshCard**

Add the card in the stats/activity area of the Command Center. Update `STAGE_NAMES` and `STAGE_COLORS` arrays to drop "Feed Refresh" (index 0).

**Step 2: Commit**

```bash
git add src/pages/admin/command-center.tsx
git commit -m "feat: add feed refresh summary card to Command Center"
```

---

### Task 8: Frontend — Add FeedRefreshCard to Catalog

**Files:**
- Modify: `src/pages/admin/catalog.tsx`

**Step 1: Import and place FeedRefreshCard**

Add the card above the podcast grid as a compact status bar.

**Step 2: Commit**

```bash
git add src/pages/admin/catalog.tsx
git commit -m "feat: add feed refresh summary card to Catalog page"
```

---

### Task 9: Backend tests

**Files:**
- Modify or create: `worker/routes/admin/__tests__/pipeline.test.ts`
- Modify or create: `worker/routes/admin/__tests__/dashboard.test.ts`

**Step 1: Test feed-refresh-summary endpoint**

- Returns summary with correct structure
- Handles empty database gracefully

**Step 2: Test enriched job detail**

- PENDING job returns queuePosition and upstreamProgress
- Job with requestId returns requestContext
- Non-PENDING job omits queuePosition

**Step 3: Test /stages returns 2-5 only**

**Step 4: Commit**

```bash
git add worker/routes/admin/__tests__/
git commit -m "test: backend tests for pipeline UI redesign endpoints"
```

---

### Task 10: Frontend tests

**Files:**
- Create or modify: `src/pages/admin/__tests__/pipeline.test.tsx`

**Step 1: Test Pipeline page renders 4 columns (stages 2-5)**

- Verify no "Feed Refresh" column
- Verify summary bar renders with correct counts
- Verify jobs sorted by status priority

**Step 2: Test FeedRefreshCard**

- Renders summary data
- Refresh button triggers API call

**Step 3: Commit**

```bash
git add src/pages/admin/__tests__/ src/components/admin/__tests__/
git commit -m "test: frontend tests for pipeline UI redesign"
```

---

### Task 11: Integration verification

**Step 1: Run all backend tests**

```bash
npx vitest run worker/ --reporter=verbose
```

**Step 2: Run all frontend tests**

```bash
npx vitest run src/ --reporter=verbose
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 4: Fix any issues found**

**Step 5: Final commit if needed**
