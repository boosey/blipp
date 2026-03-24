# Apple Catalog Source Design

**Date**: 2026-03-21
**Status**: Approved (user approved design verbally before leaving)

## Summary

Add Apple Podcasts as a first-class catalog source. Apple's top 100 runs first during catalog refresh and is authoritative — Podcast Index runs second and fills in null fields only for Apple-sourced podcasts. Admin UI gets source badges, filters, and a new Sources overview page.

## Decisions

1. **iTunes RSS endpoint** — Use `itunes.apple.com/us/rss/toppodcasts/limit=100/json` instead of the broken `rss.marketingtools.apple.com` Charts API (genre filtering doesn't work on the newer API).
2. **Sequential in single handler** — Apple and PI run sequentially in `handleCatalogRefresh`. No new queues needed.
3. **Source precedence** — Apple runs first. When PI finds a podcast that already exists (matched by feedUrl), it only updates fields that are currently `null`. It does NOT overwrite Apple-provided data.
4. **`Podcast.source` field** — Repurposed from `"trending"/"user_request"/"manual"` to `"apple"/"podcast-index"/"manual"`. Existing rows treated as `"podcast-index"`.
5. **Admin UI** — Source badge + filter on catalog page. New dedicated Sources page with per-source stats.

## Backend Changes

### 1. `worker/lib/apple-podcasts.ts` — Add `top100()` method

New method using the iTunes RSS endpoint:
```
GET https://itunes.apple.com/us/rss/toppodcasts/limit=100/json
```

Response shape differs from Charts API — entries use `im:name`, `im:artist`, `im:image`, `category` fields. Parse into existing `AppleChartEntry`-compatible shape or a new `AppleRSSEntry` type.

### 2. `worker/lib/catalog-sources.ts` — Update Apple discover()

- Call `top100()` instead of `topByGenre("", 100, "us")`
- The iTunes RSS endpoint doesn't include `feedUrl` — still need PI `batchByItunesId()` to resolve feed URLs
- Map categories from the RSS response format

### 3. `worker/queues/catalog-refresh.ts` — Multi-source refresh

Current flow (single source):
```
discover(PI) → upsert → queue feed refresh
```

New flow:
```
discover(Apple) → upsert with source="apple"
discover(PI) → upsert with null-field-fill for existing, full upsert for new → queue feed refresh
```

Key changes to upsert logic:
- `bulkInsertPodcasts`: Set `source` from the discovered podcast's source identifier
- `upsertPodcasts`: When updating an existing podcast where `source="apple"`, only update null fields
- New helper: `mergeNullFields(existing, incoming)` — returns update data with only null fields filled

### 4. `worker/routes/admin/podcasts.ts` — API changes

- `GET /stats` — Add `bySource` to response: `Record<string, number>`
- `GET /` — Add `source` filter param, include `source` in response data
- New: `GET /sources` — Per-source stats (count, health breakdown, episode count, last refresh time)

### 5. Source tracking in `bulkInsertPodcasts` / `upsertPodcasts`

The `source` field on `Podcast` model already exists. Update insert/upsert to set it from `DiscoveredPodcast` metadata. Add `source` to `DiscoveredPodcast` interface or derive from the `CatalogSource.identifier`.

## Frontend Changes

### 6. `src/types/admin.ts`

- Add `source?: string` to `AdminPodcast`
- Add `bySource: Record<string, number>` to `CatalogStats`
- Add `source?: string` to `CatalogFilters`
- New `PodcastSourceStats` type for the sources page

### 7. `src/pages/admin/catalog.tsx`

- Source badge on each podcast card (small colored badge: "Apple" / "PI" / "Manual")
- Source filter in sidebar (same pattern as health/status filters)
- Source breakdown in stats sidebar

### 8. New: `src/pages/admin/podcast-sources.tsx`

Overview page showing each source:
- Name, identifier, status (active)
- Podcast count and % of catalog
- Health breakdown (mini bar chart)
- Episode count
- Last catalog refresh time
- Link to catalog page pre-filtered by that source

### 9. `src/App.tsx` — Add route

```tsx
const PodcastSources = lazy(() => import("./pages/admin/podcast-sources"));
// Route: /admin/podcast-sources
```

## Migration

No schema migration needed — `Podcast.source` already exists as `String?`. Existing values (`"trending"` etc.) will be treated as `"podcast-index"` in the UI and overwritten on next catalog refresh.
