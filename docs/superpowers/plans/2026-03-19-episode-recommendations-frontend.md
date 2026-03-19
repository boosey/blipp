# Episode Recommendations — Frontend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Netflix-style Discover page with curated rows + episode/podcast tabs, unified Stage Configuration admin page (merge models + prompts + controls), enhanced Recommendations admin page with settings/embeddings/topics tabs.

**Architecture:** Discover consumes new `/curated` API for personalized rows, general browse split into Episodes and Podcasts tabs. Admin pages consolidate 3 separate pages into 1 Stage Configuration page, and extend Recommendations page with new tabs.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui, existing `useAdminFetch`/`useFetch` hooks.

**Worktree:** `C:\Users\boose\Projects\blipp\.worktrees\feat-episode-recommendations`

**Depends on:** Backend Plan A (curated API, admin endpoints)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/Discover.tsx` | Rewrite | Netflix-style curated rows + tabbed browse |
| `src/components/episode-card.tsx` | Create | Standalone episode card for recommendations |
| `src/components/curated-row.tsx` | Create | Generic curated row (title + horizontal scroll of cards) |
| `src/pages/admin/stage-configuration.tsx` | Create | Unified stage config (models + prompts + controls) |
| `src/pages/admin/recommendations.tsx` | Rewrite | Add Settings, Embeddings, Topics tabs |
| `src/pages/admin/stage-models.tsx` | Delete | Absorbed into stage-configuration |
| `src/pages/admin/prompt-management.tsx` | Delete | Absorbed into stage-configuration |
| `src/pages/admin/pipeline-controls.tsx` | Modify | Remove stage controls (keep manual triggers only) |
| `src/layouts/admin-layout.tsx` | Modify | Update sidebar (remove Prompts, rename Stage Models) |
| `src/App.tsx` | Modify | Update admin routes |
| `src/types/recommendations.ts` | Create | Shared types for curated rows, episode recs |

---

### Task 1: Episode Card Component

**Files:** `src/components/episode-card.tsx`

- [ ] Create `EpisodeCard` component for episode recommendations:
  - Props: `episodeId, episodeTitle, podcastTitle, podcastImageUrl, publishedAt, durationSeconds, topicTags?, reason?, onPlay?, onDismiss?`
  - Layout: podcast artwork (small), episode title (primary), podcast name (secondary), duration, publish date
  - "Suggested" badge for recommended episodes
  - Play button, dismiss (X) button
  - Click opens podcast sheet
  - Compact horizontal variant for scrollable rows
  - Vertical variant for list view
- [ ] Commit: `feat: add episode card component`

---

### Task 2: Curated Row Component

**Files:** `src/components/curated-row.tsx`

- [ ] Create `CuratedRow` component:
  - Props: `title, items: (EpisodeCard | PodcastCard)[], type: "episodes" | "podcasts" | "mixed"`
  - Uses existing `ScrollableRow` for horizontal scroll
  - Section header with title
  - "See all" link if items > visible count
  - Gracefully hides if items is empty
- [ ] Commit: `feat: add curated row component`

---

### Task 3: Recommendation Types

**Files:** `src/types/recommendations.ts`

- [ ] Define shared types matching backend API:
  ```typescript
  interface CuratedRow {
    title: string;
    type: "episodes" | "podcasts" | "mixed";
    items: CuratedItem[];
  }
  interface CuratedItem {
    episode?: { id, title, publishedAt, durationSeconds, topicTags };
    podcast: { id, title, author, imageUrl, categories, episodeCount, subscriberCount };
    score: number;
    reasons: string[];
  }
  interface CuratedResponse {
    rows: CuratedRow[];
    podcastSuggestions: PodcastSuggestion[];
  }
  interface PodcastSuggestion {
    podcast: CatalogPodcast;
    matchedEpisodeCount: number;
    topReasons: string[];
    score: number;
  }
  ```
- [ ] Commit: `feat: add recommendation types`

---

### Task 4: Discover Page Redesign

**Files:** `src/pages/Discover.tsx`

Current structure: search + category pills + Trending row + For You row + Browse All (infinite scroll podcasts).

New structure:
- [ ] Search bar (keep existing)
- [ ] Category pills (keep, now filters everything below)
- [ ] Curated rows section:
  - Fetch from `GET /recommendations/curated?genre={selectedCategory}`
  - Render each row as `CuratedRow` component
  - Mix of episode and podcast cards based on row type
  - Podcast suggestions shown as "You might want to subscribe" row
- [ ] General browse section with tabs:
  - `[Episodes] [Podcasts]` tab switcher
  - Episodes tab: fetch from `GET /recommendations/episodes?genre=X&search=Y&page=N`, infinite scroll of `EpisodeCard`s
  - Podcasts tab: existing catalog browse (keep current infinite scroll)
  - Both filtered by active genre pill
- [ ] Search behavior: filters the general browse list, curated rows remain visible
- [ ] Pull-to-refresh refetches curated rows
- [ ] Keep existing podcast request form
- [ ] Commit: `feat: Netflix-style Discover page with curated rows`

---

### Task 5: Home Page Updates

**Files:** `src/pages/Home.tsx`

- [ ] Replace current podcast card "For You" row with episode-based recommendations
- [ ] Fetch from `/recommendations/curated` (same API, maybe limit to 1-2 rows)
- [ ] Show episode cards instead of podcast thumbnails — more actionable (play immediately)
- [ ] Keep existing feed below
- [ ] Commit: `feat: episode recommendations on Home page`

---

### Task 6: Unified Stage Configuration Admin Page

**Files:** `src/pages/admin/stage-configuration.tsx`

This replaces stage-models.tsx + prompt-management.tsx and absorbs stage controls from pipeline-controls.tsx.

- [ ] Create new page with expandable cards per pipeline stage (STT, Distillation, Narrative, TTS, Briefing Assembly)
- [ ] Each stage card contains:
  - **Header**: Stage name, icon, enabled/disabled toggle
  - **Models section**: Primary/Secondary/Tertiary model dropdowns (from stage-models.tsx)
  - **Prompt section**: Inline textarea with prompt text, save/reset buttons, "customized" badge (from prompt-management.tsx)
  - **Stats row**: Success rate, avg latency, today's cost (from pipeline stages API)
- [ ] Stage data loaded from:
  - `GET /admin/config` (stage enable/disable + model config)
  - `GET /admin/ai-models` (model registry)
  - `GET /admin/prompts` (prompt values)
  - `GET /admin/pipeline/stages` (stats)
- [ ] All mutations use existing PATCH endpoints
- [ ] Export as default
- [ ] Commit: `feat: unified Stage Configuration admin page`

---

### Task 7: Update Pipeline Controls

**Files:** `src/pages/admin/pipeline-controls.tsx`

Now that per-stage controls moved to Stage Configuration:

- [ ] Remove per-stage enable/disable toggles (moved to stage-config)
- [ ] Keep: master pipeline toggle, auto-run interval, max episodes, log level, request archiving, manual trigger
- [ ] Rename to just "Pipeline Settings" in concept (file stays same)
- [ ] Commit: `refactor: slim pipeline controls after stage config extraction`

---

### Task 8: Enhanced Recommendations Admin Page

**Files:** `src/pages/admin/recommendations.tsx`

Current: two-pane layout with Users list + User Detail/Podcast Profiles tabs.

New: add tabs for Settings, Embeddings, Topics alongside existing tabs.

- [ ] Restructure right pane tabs: `[User Detail] [Podcast Profiles] [Settings] [Embeddings] [Topics]`
- [ ] **Settings tab**: Fetch `GET /admin/recommendations/config`, render editable form for all `recommendations.*` keys (weights, thresholds, flags). Save via `PATCH /admin/recommendations/config`.
- [ ] **Embeddings tab**: Fetch `GET /admin/recommendations/embeddings/status`, show: enabled toggle, model name, progress (X/Y podcasts, X/Y users), last compute time, Recompute button.
- [ ] **Topics tab**: Fetch `GET /admin/recommendations/topics?page=1`, show paginated table of podcasts with their topic tags. Search filter. Click podcast to expand and see per-episode topics.
- [ ] Keep existing User Detail and Podcast Profiles tabs as-is
- [ ] Commit: `feat: add Settings, Embeddings, Topics tabs to admin Recommendations`

---

### Task 9: Admin Layout + Route Updates

**Files:** `src/layouts/admin-layout.tsx`, `src/App.tsx`

- [ ] Sidebar changes:
  - AI group: rename "Stage Models" to "Stage Configuration", remove "Prompts"
  - Pipeline group: keep Controls (slimmed)
  - Import appropriate icon for Stage Configuration
- [ ] Route changes in App.tsx:
  - Add: `stage-configuration` route → lazy StageConfiguration
  - Remove: `stage-models` route, `prompt-management` route
  - Add redirect: `/admin/stage-models` → `/admin/stage-configuration`
  - Add redirect: `/admin/prompt-management` → `/admin/stage-configuration`
- [ ] Delete old files: `src/pages/admin/stage-models.tsx`, `src/pages/admin/prompt-management.tsx`
- [ ] Commit: `refactor: update admin routes and sidebar for unified pages`

---

### Task 10: Verification

- [ ] Typecheck: `npx tsc --noEmit`
- [ ] Build: `npm run build`
- [ ] Run existing tests: `npx vitest run src/__tests__/`
- [ ] Manual verification checklist:
  - [ ] Discover page loads curated rows
  - [ ] Genre pills filter both curated rows and browse list
  - [ ] Episodes tab shows episode cards
  - [ ] Podcasts tab shows podcast grid
  - [ ] Stage Configuration page shows all stages with models + prompts
  - [ ] Recommendations page has 5 tabs all functional
  - [ ] Old routes redirect properly
- [ ] Commit: `test: frontend verification complete`

---

## Test Plan

| Area | Type | What's Tested |
|------|------|---------------|
| EpisodeCard | Manual | Renders correctly, play button works, dismiss works |
| CuratedRow | Manual | Horizontal scroll, empty state, see-all link |
| Discover | Manual | Curated rows load, genre filtering, tab switching, search, infinite scroll |
| Stage Configuration | Manual | All stages render, model dropdowns work, prompt edit/save/reset, toggle |
| Recommendations | Manual | All 5 tabs load, settings save, embeddings status, topics browse |
| Routing | Manual | Old routes redirect, new routes resolve |
| Build | Automated | `npm run build` succeeds |
| Typecheck | Automated | `npx tsc --noEmit` clean |
| Existing tests | Automated | `npx vitest run src/__tests__/` pass |
