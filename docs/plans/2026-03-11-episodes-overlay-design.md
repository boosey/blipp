# Episodes Overlay — Remove Episodes Page, Add Podcast Detail Modal

**Date**: 2026-03-11
**Status**: Approved

## Summary

Remove the standalone Episodes admin page. Replace it with a wide modal/sheet on the Catalog page that opens when clicking a podcast, showing podcast info + accordion episode list with inline clip details and BriefingRequest traceability.

## Motivation

The Episodes page duplicates information already accessible from the Catalog page's podcast context. Consolidating into a single overlay reduces navigation friction and keeps episode data contextualized within its parent podcast.

## Design

### Modal Structure

- **Trigger**: Click any podcast card (grid) or row (list) in the Catalog page
- **Size**: ~80vw, max 1200px, centered dialog (shadcn `Dialog`)
- **Top section**: Podcast info — image, title, author, RSS URL (copyable), stats grid (episode count, subscribers, health badge, last fetched). Quick action icon buttons (refresh, pause/archive/delete)
- **Episode list**: Below podcast info. Each episode is an accordion item (shadcn `Accordion`). Sorted by `publishedAt` desc. Shows title, published date, duration, pipeline status dots

### Episode Accordion Content

Two tabs inside each expanded accordion item:

**Overview tab**:
- Published date, duration, pipeline status, cost
- Transcript link, audio link
- Compact grid layout

**Clips tab**:
- Clips sorted by `durationTier` ascending (shortest first)
- Each clip shows: duration tier label, actual seconds, status badge, **play button** (inline `<audio>` element)
- Clicking a clip row expands to show linked FeedItems:
  - User (userId)
  - Source (SUBSCRIPTION / ON_DEMAND)
  - Status
  - `requestId` — the BriefingRequest that triggered production
  - Created date

### Dropped Features (vs current Episodes page)

- Pipeline Trace tab — debugging tool, not needed in v1
- Logs tab — debugging tool, not needed in v1
- Reprocess button — can add back later if needed
- Search/filter episodes across all podcasts — use catalog filters to find the podcast first

## File Changes

### Deleted

| File | Reason |
|------|--------|
| `src/pages/admin/episodes.tsx` | Standalone page removed |
| `worker/routes/admin/episodes.ts` | Backend API no longer needed |
| `worker/routes/admin/__tests__/episodes.test.ts` | Tests for deleted route |

### Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Remove `/admin/episodes` route + lazy import |
| `src/pages/admin/catalog.tsx` | Replace sidebar detail panel with wide modal containing podcast info + episode accordion + clip expansion |
| `src/types/admin.ts` | Update `AdminPodcastDetail` to include clips + feedItems per episode |
| `worker/routes/admin/index.ts` | Remove episodes route mount |
| `worker/routes/admin/podcasts.ts` | Extend `GET /podcasts/:id` to return clips (with feedItems + requestId) per episode |
| Admin sidebar/nav component | Remove Episodes nav link |

### Backend: Extended `GET /api/admin/podcasts/:id` Response

Current response includes `episodes` (recent 20 with `clipCount` and `pipelineStatus`). Extend each episode to include:

```typescript
episodes: Array<{
  id: string;
  title: string;
  audioUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  transcriptUrl: string | null;
  pipelineStatus: string;
  totalCost: number | null; // aggregated from PipelineStep.cost across all jobs for this episode
  clips: Array<{
    id: string;
    durationTier: number;
    actualSeconds: number | null;
    status: string;
    audioUrl: string | null;
    feedItems: Array<{
      id: string;
      userId: string;
      source: string;
      status: string;
      requestId: string | null;
      createdAt: string;
    }>;
  }>;
}>
```

Clips sorted by `durationTier` asc. FeedItems are grouped under clips via application-level matching on `episodeId` + `durationTier` (no direct Prisma relation exists between Clip and FeedItem). The query fetches episodes with `include: { clips, feedItems }` then groups feedItems under the matching clip in code.

`totalCost` is aggregated by summing `PipelineStep.cost` across all PipelineJobs for the episode (no `cost` column on Episode).

### Frontend: Modal Component

Extract the modal as a component within `catalog.tsx` (or a sibling file if it gets large). Key elements:

- `Dialog` from shadcn with custom width class (`max-w-[1200px] w-[80vw]`)
- `Accordion` from shadcn for episode list (single expand mode)
- `Tabs` from shadcn for Overview/Clips within each accordion item
- Nested expandable clip rows (simple state toggle, not another accordion)
- `<audio controls>` for clip playback

### Nav Update

Identify and remove the "Episodes" link from the admin sidebar navigation. The sidebar component needs to be located and updated.

## Data Flow

1. User clicks podcast card → modal opens
2. Modal fetches `GET /api/admin/podcasts/:id` (already exists, extended)
3. Podcast info renders at top
4. Episode accordion renders below
5. User expands episode → Overview/Clips tabs shown
6. Clips tab shows clips sorted shortest first
7. User clicks clip → FeedItems expand inline showing requestId traceability
