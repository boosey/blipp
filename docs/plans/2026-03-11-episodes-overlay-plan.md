# Episodes Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone Episodes admin page and surface episode/clip/feedItem data as an overlay modal within the Catalog page.

**Architecture:** Extend the existing `GET /api/admin/podcasts/:id` backend to include clips + feedItems per episode. Replace the catalog's 360px sidebar `DetailsPanel` with a wide `Dialog` modal containing podcast info, an accordion episode list, and nested clip/feedItem expansion. Delete the episodes frontend page only — keep the episodes backend API as it's consumed by the Requests and Pipeline pages.

**Tech Stack:** Hono (backend), Prisma 7 (DB), React 19, shadcn/ui (Dialog, Accordion, Tabs), Tailwind v4

---

## File Structure

### Deleted
- `src/pages/admin/episodes.tsx` — standalone episodes frontend page

### Kept (consumed by Requests + Pipeline pages)
- `worker/routes/admin/episodes.ts` — episodes API route (NOT deleted)
- `worker/routes/admin/__tests__/episodes.test.ts` — episodes API tests (NOT deleted)

### Modified
- `worker/routes/admin/podcasts.ts` — extend `GET /:id` to include clips + feedItems per episode, aggregate cost
- `worker/routes/admin/__tests__/podcasts.test.ts` — add test for extended response
- `src/pages/admin/catalog.tsx` — replace `DetailsPanel` sidebar with wide `PodcastDetailModal` dialog
- `src/types/admin.ts` — add new clip/feedItem types for podcast detail (keep `AdminEpisode` — used by Requests page)
- `src/layouts/admin-layout.tsx` — remove Episodes nav item
- `src/App.tsx` — remove `/admin/episodes` route + lazy import

---

## Chunk 1: Backend — Extend Podcast Detail Endpoint

### Task 1: Update types for extended podcast detail response

**Files:**
- Modify: `src/types/admin.ts`

- [ ] **Step 1: Update `AdminEpisodeSummary` and `AdminPodcastDetail` types**

Add clip and feedItem types to the admin types. Update `AdminEpisodeSummary` to include the new nested data. Keep `AdminEpisode` (used by Requests page). Remove only `EpisodePipelineTrace` and `EpisodeStageTrace` (only used by deleted episodes page).

```typescript
// Add to src/types/admin.ts after existing types

export interface AdminClipSummary {
  id: string;
  durationTier: number;
  actualSeconds: number | null;
  status: string;
  audioUrl: string | null;
  feedItems: AdminClipFeedItem[];
}

export interface AdminClipFeedItem {
  id: string;
  userId: string;
  source: string;
  status: string;
  requestId: string | null;
  createdAt: string;
}
```

Update `AdminEpisodeSummary`:
```typescript
export interface AdminEpisodeSummary {
  id: string;
  title: string;
  audioUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  transcriptUrl: string | null;
  pipelineStatus: EpisodePipelineStatus;
  clipCount: number;
  totalCost: number | null;
  clips: AdminClipSummary[];
}
```

Remove: `EpisodePipelineTrace`, `EpisodeStageTrace` interfaces (only used by deleted episodes page). Keep `AdminEpisode` (used by Requests page).

- [ ] **Step 2: Commit**

```bash
git add src/types/admin.ts
git commit -m "refactor: update admin types for podcast detail with clips and feedItems"
```

### Task 2: Extend `GET /api/admin/podcasts/:id` backend

**Files:**
- Modify: `worker/routes/admin/podcasts.ts:114-204`

- [ ] **Step 1: Write test for extended response**

Add a test to `worker/routes/admin/__tests__/podcasts.test.ts` that verifies the `GET /:id` response includes clips with feedItems per episode and totalCost.

```typescript
it("GET /:id returns episodes with clips and feedItems", async () => {
  const mockPodcast = {
    id: "pod1",
    title: "Test Pod",
    description: null,
    feedUrl: "https://example.com/feed.xml",
    imageUrl: null,
    author: null,
    categories: [],
    lastFetchedAt: new Date(),
    feedHealth: "good",
    feedError: null,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { episodes: 1, subscriptions: 0 },
    episodes: [{
      id: "ep1",
      title: "Episode 1",
      audioUrl: "https://example.com/ep1.mp3",
      publishedAt: new Date(),
      durationSeconds: 3600,
      transcriptUrl: null,
      _count: { clips: 1 },
      distillation: { status: "COMPLETED" },
      clips: [{
        id: "clip1",
        durationTier: 1,
        actualSeconds: 58,
        status: "COMPLETED",
        audioUrl: "https://r2.example.com/clip1.mp3",
      }],
      feedItems: [{
        id: "fi1",
        userId: "user1",
        source: "SUBSCRIPTION",
        status: "READY",
        requestId: "req1",
        durationTier: 1,
        createdAt: new Date(),
      }],
    }],
  };

  mockPrisma.podcast.findUnique.mockResolvedValue(mockPodcast);
  mockPrisma.pipelineJob.findMany.mockResolvedValue([]);
  mockPrisma.pipelineStep.aggregate.mockResolvedValue({ _sum: { cost: 0.05 } });

  const res = await app.request("/pod1");
  expect(res.status).toBe(200);
  const body = await res.json();
  const ep = body.data.episodes[0];
  expect(ep.clips).toHaveLength(1);
  expect(ep.clips[0].feedItems).toHaveLength(1);
  expect(ep.clips[0].feedItems[0].requestId).toBe("req1");
  expect(ep.totalCost).toBe(0.05);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx vitest run worker/routes/admin/__tests__/podcasts.test.ts --reporter=verbose
```

Expected: FAIL — current endpoint doesn't return clips/feedItems/totalCost.

- [ ] **Step 3: Implement extended query in `GET /:id`**

Modify `worker/routes/admin/podcasts.ts` line ~114-204. Key changes:

1. Add `clips` and `feedItems` to the episode include:
```typescript
episodes: {
  take: 20,
  orderBy: { publishedAt: "desc" },
  include: {
    _count: { select: { clips: true } },
    distillation: { select: { status: true } },
    clips: {
      orderBy: { durationTier: "asc" },
      select: {
        id: true,
        durationTier: true,
        actualSeconds: true,
        status: true,
        audioUrl: true,
      },
    },
    feedItems: {
      select: {
        id: true,
        userId: true,
        source: true,
        status: true,
        requestId: true,
        durationTier: true,
        createdAt: true,
      },
    },
  },
},
```

2. Aggregate cost per episode using `pipelineStep.aggregate`:
```typescript
// After fetching podcast, aggregate costs per episode
const episodeCosts = await Promise.all(
  podcast.episodes.map(async (e: any) => {
    try {
      const result = await prisma.pipelineStep.aggregate({
        where: { job: { episodeId: e.id } },
        _sum: { cost: true },
      });
      return { episodeId: e.id, cost: result._sum.cost };
    } catch {
      return { episodeId: e.id, cost: null };
    }
  })
);
const costMap = new Map(episodeCosts.map((c) => [c.episodeId, c.cost]));
```

3. Group feedItems under clips in the episode mapper:
```typescript
const episodes = podcast.episodes.map((e: any) => {
  // ... existing pipelineStatus logic ...

  const clips = (e.clips ?? []).map((clip: any) => ({
    id: clip.id,
    durationTier: clip.durationTier,
    actualSeconds: clip.actualSeconds,
    status: clip.status,
    audioUrl: clip.audioUrl,
    feedItems: (e.feedItems ?? [])
      .filter((fi: any) => fi.durationTier === clip.durationTier)
      .map((fi: any) => ({
        id: fi.id,
        userId: fi.userId,
        source: fi.source,
        status: fi.status,
        requestId: fi.requestId,
        createdAt: fi.createdAt.toISOString(),
      })),
  }));

  return {
    id: e.id,
    title: e.title,
    audioUrl: e.audioUrl,
    publishedAt: e.publishedAt?.toISOString(),
    durationSeconds: e.durationSeconds,
    transcriptUrl: e.transcriptUrl,
    pipelineStatus,
    clipCount: e._count.clips,
    totalCost: costMap.get(e.id) ?? null,
    clips,
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx vitest run worker/routes/admin/__tests__/podcasts.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/routes/admin/podcasts.ts worker/routes/admin/__tests__/podcasts.test.ts
git commit -m "feat: extend podcast detail endpoint with clips, feedItems, and cost per episode"
```

---

## Chunk 2: Remove Episodes Frontend Page + Nav

### Task 3: Remove episodes frontend route and nav

**Files:**
- Modify: `src/App.tsx:20,83`
- Modify: `src/layouts/admin-layout.tsx:36`
- Delete: `src/pages/admin/episodes.tsx`

- [ ] **Step 1: Remove episodes lazy import and route from `src/App.tsx`**

Remove line 20: `const Episodes = lazy(() => import("./pages/admin/episodes"));`
Remove line 83: `<Route path="episodes" element={<Suspense fallback={<AdminLoading />}><Episodes /></Suspense>} />`

- [ ] **Step 2: Remove episodes nav item from `src/layouts/admin-layout.tsx`**

Remove line 36: `{ path: "episodes", label: "Episodes", icon: Disc3, shortcut: "E" },`

Also remove the `Disc3` import from lucide-react if it's no longer used elsewhere.

- [ ] **Step 3: Delete `src/pages/admin/episodes.tsx`**

- [ ] **Step 4: Run typecheck**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Clean up unused types in `src/types/admin.ts`**

Remove `EpisodePipelineTrace`, `EpisodeStageTrace` (confirmed unused after episodes page deletion). Keep `AdminEpisode` (used by Requests page), `AdminEpisodeSummary` (used by catalog modal), and `EpisodePipelineStatus`.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/layouts/admin-layout.tsx src/types/admin.ts
git rm src/pages/admin/episodes.tsx
git commit -m "refactor: remove episodes admin page, route, and nav link"
```

---

## Chunk 3: Frontend — Podcast Detail Modal

### Task 4: Replace DetailsPanel sidebar with PodcastDetailModal

**Files:**
- Modify: `src/pages/admin/catalog.tsx`

This is the largest task. Replace the `DetailsPanel` component (lines 430-642) with a `PodcastDetailModal` component that uses `Dialog` (wide, ~80vw max 1200px).

- [ ] **Step 1: Replace `DetailsPanel` with `PodcastDetailModal`**

The new component:
- Uses `Dialog` + `DialogContent` with `className="max-w-[1200px] w-[80vw]"`
- **Top section**: Podcast image, title, author, RSS URL (copyable), stats row (episodes, subscribers, last fetched), health + status badges, quick action buttons (refresh, pause, archive, delete)
- **Episode list**: `Accordion` (type="single") with episodes sorted by publishedAt desc
- Each `AccordionItem` trigger shows: title, published date, duration, pipeline status badge
- Each `AccordionItem` content has `Tabs` with Overview and Clips tabs

**Overview tab** (inside accordion):
- Published date, duration, pipeline status, totalCost
- Transcript link (if available), audio link (if available)
- Compact 2-column grid

**Clips tab** (inside accordion):
- List of clips sorted by durationTier ascending (already sorted from backend)
- Each clip: duration tier label (e.g. "1 min"), actual seconds, status badge, play button
- Play button renders `<audio controls src={clip.audioUrl} />` inline when clicked
- Clicking clip row toggles expansion showing feedItems:
  - userId, source badge, status badge, requestId, createdAt

- [ ] **Step 2: Update the main `Catalog` component to use the modal**

Replace the sidebar rendering logic:
- Change `selectedId` to open the modal dialog instead of showing sidebar
- Remove the `{selectedId && <DetailsPanel ... />}` block
- Add `<PodcastDetailModal podcastId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />`

- [ ] **Step 3: Add necessary imports**

Add to imports:
```typescript
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
```

Also import `Play`, `Volume2` from lucide-react for the audio play button. Remove unused imports from the old DetailsPanel (like `Activity`, `Library` if no longer referenced).

- [ ] **Step 4: Run typecheck**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/catalog.tsx
git commit -m "feat: replace catalog sidebar with wide podcast detail modal"
```

### Task 5: Verify shadcn Accordion component exists

**Files:**
- Check: `src/components/ui/accordion.tsx`

- [ ] **Step 1: Check if accordion component exists**

```bash
ls C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay/src/components/ui/accordion.tsx
```

If missing, install it:
```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx shadcn@latest add accordion
```

**Note:** This task should be done BEFORE Task 4. If accordion is missing, install it and commit first.

- [ ] **Step 2: Commit if component was added**

```bash
git add src/components/ui/accordion.tsx
git commit -m "chore: add shadcn accordion component"
```

---

## Chunk 4: Verification & Cleanup

### Task 6: Full verification

- [ ] **Step 1: Run full typecheck**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 3: Run build**

```bash
cd C:/Users/boose/Projects/blipp/.worktrees/refactor-episodes-overlay
npm run build
```

- [ ] **Step 4: Fix any issues found**

Address build errors, type errors, or test failures.

- [ ] **Step 5: Final commit if any fixes needed**

### Task 7: Update docs

**Files:**
- Modify: `docs/admin-platform.md` — remove episodes page section, update catalog page description
- Modify: `docs/api-reference.md` — update podcasts/:id response shape (episodes API stays)
- Modify: `docs/architecture.md` — update admin page count (9 → 8)

- [ ] **Step 1: Update documentation to reflect removal of episodes page**

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: update admin docs to reflect episodes page removal"
```

---

## Execution Order

Tasks should be executed in this order due to dependencies:

1. **Task 1** (types) + **Task 5** (check accordion) — no deps, parallelizable
2. **Task 2** (backend endpoint) — depends on Task 1
3. **Task 3** (remove episodes frontend) — independent of Task 2
4. **Task 4** (catalog modal) — depends on Tasks 1, 2, 5
5. **Task 6** (verification) — depends on all above
6. **Task 7** (docs) — depends on Task 6

**Parallelizable:** Tasks 1 + 5 can run in parallel. Tasks 2 + 3 can run in parallel.
