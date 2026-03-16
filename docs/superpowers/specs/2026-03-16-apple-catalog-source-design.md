# Apple Podcasts Catalog Source

## Problem

The current catalog uses Podcast Index's trending API, which surfaces niche/momentum podcasts rather than mainstream popular shows. Well-known podcasts (Joe Rogan, Crime Junkie, etc.) are missing from the catalog. Additionally, categories are hardcoded in the user-facing UI and never populated from real data.

## Solution

Switch the primary catalog discovery source to Apple Podcasts, using Apple's public Charts API and iTunes Lookup API. Fetch top podcasts across all 19 Apple genre categories to build a catalog of ~1,500-2,500 unique podcasts with proper category taxonomy. Keep Podcast Index as a registered fallback source.

## Data Model Changes

### New Models

```prisma
model Category {
  id           String            @id @default(cuid())
  appleGenreId String            @unique
  name         String
  podcasts     PodcastCategory[]
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
}

model PodcastCategory {
  podcastId  String
  categoryId String
  podcast    Podcast  @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  @@id([podcastId, categoryId])
}
```

### Podcast Model Changes

New fields:
- `appleId String? @unique` — Apple podcast ID (primary external key for Apple source)
- `language String?` — From RSS `<language>` tag, populated during feed-refresh
- `appleMetadata Json?` — Full iTunes Lookup response blob for rich metadata access
- `podcastCategories PodcastCategory[]` — Relation to Category join table

Modified fields:
- `status` — Add `"pending_deletion"` value (existing: active, paused, archived)
- `source` — Add `"apple"` value (existing: trending, user_request, manual)

Kept as-is:
- `categories String[]` — Retained for quick display; Category relation is source of truth for queries
- `podcastIndexId String? @unique` — Retained for Podcast Index fallback source

## Apple Podcasts Client

New file: `worker/lib/apple-podcasts.ts`

### APIs Used

**Charts API** (no auth):
```
GET https://rss.marketingtools.apple.com/api/v2/{country}/podcasts/top/{limit}/{genre}/podcasts.json
```
- One call per genre (19 calls for all categories)
- Returns: `feed.results[]` with `id`, `name`, `artistName`, `artworkUrl100`, `genres[]`, `url`
- Max 200 results per call

**iTunes Lookup API** (no auth):
```
GET https://itunes.apple.com/lookup?id={csv_ids}&entity=podcast
```
- Supports comma-separated IDs, batched at ~150 per request
- Returns: `feedUrl`, `collectionName`, `artistName`, `artworkUrl600`, `genres[]`, `genreIds[]`, `primaryGenreName`, `trackCount`, `contentAdvisoryRating`, full metadata

**iTunes Search API** (no auth):
```
GET https://itunes.apple.com/search?term={query}&media=podcast&limit={limit}
```
- Used for the `search()` method on the CatalogSource interface
- Returns feed URLs directly (no second lookup needed)

### Client Methods

```typescript
class ApplePodcastsClient {
  topByGenre(genreId: string, limit: number, country: string): Promise<AppleChartEntry[]>
  topAllGenres(limit: number, country: string): Promise<AppleChartEntry[]>  // fetches all 19, deduplicates
  lookupBatch(ids: string[]): Promise<AppleLookupResult[]>  // chunks into batches of 150
  search(term: string, limit: number): Promise<AppleLookupResult[]>
}
```

### Genre ID Map

Apple's genre IDs are stable. Hardcoded as a const:

```typescript
const APPLE_PODCAST_GENRES: Record<string, string> = {
  "1301": "Arts",
  "1321": "Business",
  "1303": "Comedy",
  "1304": "Education",
  "1483": "Fiction",
  "1511": "Government",
  "1512": "Health & Fitness",
  "1487": "History",
  "1305": "Kids & Family",
  "1502": "Leisure",
  "1310": "Music",
  "1489": "News",
  "1314": "Religion & Spirituality",
  "1533": "Science",
  "1324": "Society & Culture",
  "1545": "Sports",
  "1318": "Technology",
  "1488": "True Crime",
  "1309": "TV & Film",
};
```

## Catalog Source Integration

In `worker/lib/catalog-sources.ts`:

### DiscoveredPodcast Interface Changes

Replace generic `externalId` with source-specific fields to prevent writing Apple IDs into `podcastIndexId`:

```typescript
export interface DiscoveredPodcast {
  feedUrl: string;
  title: string;
  description?: string;
  imageUrl?: string;
  author?: string;
  appleId?: string;          // NEW — Apple podcast ID
  podcastIndexId?: string;   // NEW — replaces generic externalId
  categories?: { genreId: string; name: string }[];  // NEW — genre data
}
```

The existing Podcast Index source maps `externalId` → `podcastIndexId`. The Apple source maps to `appleId`. The upsert handler writes each to its respective DB column.

### ApplePodcastsSource

```typescript
const ApplePodcastsSource: CatalogSource = {
  name: "Apple Podcasts",
  identifier: "apple",
  async discover(count, env) { /* topAllGenres → lookupBatch → map to DiscoveredPodcast */ },
  async search(query, env) { /* iTunes Search API → map to DiscoveredPodcast */ },
};
```

- Registered in the sources map alongside existing `podcast-index` source
- `count` parameter controls per-genre limit (e.g., 200 = 200 per genre = ~2,000+ unique after dedup)

## Catalog Refresh Flow

### Execution Model: Queue-Based

The catalog refresh is too heavy for a single Worker request handler (~33 outbound HTTP calls + thousands of DB writes). Cloudflare Workers have a 30-second CPU time limit. The refresh must be queue-driven:

1. **HTTP handler** (`POST /api/admin/podcasts/catalog-refresh`) — validates request, enqueues a `CATALOG_REFRESH` message to a new catalog refresh queue, returns immediately with `{ status: "queued" }`
2. **Queue consumer** (`worker/queues/catalog-refresh.ts`) — performs the actual Apple API calls, lookups, and upserts. Queue consumers have a 15-minute execution limit, which is sufficient.
3. **Progress tracking** — the queue consumer updates a `catalogRefresh.status` config key (e.g., `"fetching_charts"`, `"resolving_metadata"`, `"upserting"`, `"complete"`, `"failed"`) that the admin UI polls via `GET /api/admin/podcasts/catalog-refresh/status`.

**New queue binding required:** `CATALOG_REFRESH_QUEUE` must be added to:
- `worker/types.ts` — `CATALOG_REFRESH_QUEUE: Queue<CatalogRefreshMessage>` in `Env`
- `wrangler.jsonc` — producer and consumer entries (both staging and production)
- `worker/queues/index.ts` — new `case "catalog-refresh":` branch in the queue dispatcher
- `worker/lib/local-queue.ts` — add to `QUEUE_BINDINGS` map for local dev shim

### Separate Seed vs. Refresh Endpoints

The destructive "wipe all data" action must be separate from routine refresh:

- **`POST /api/admin/podcasts/catalog-seed`** — Destructive first-time seed. Requires confirmation payload (`{ confirm: true }`). Wipes all existing data, then runs full discovery. Only used once or when resetting the catalog.
- **`POST /api/admin/podcasts/catalog-refresh`** — Non-destructive upsert. Used for weekly refreshes. Adds new podcasts, updates existing, marks dropoffs as pending_deletion. Never deletes data.

### First Run (Catalog Seed)

1. Admin triggers catalog seed from UI (separate button with confirmation dialog)
2. Backend validates `{ confirm: true }` payload
3. Deletes all existing data in dependency order: feed items → briefings → pipeline data → subscriptions → episodes → podcasts (cascades to PodcastCategory) → categories
4. Enqueues catalog refresh message to queue consumer
5. Queue consumer:
   a. Fetches top 200 from all 19 Apple genre endpoints (19 API calls, 500ms delay between batches)
   b. Deduplicates by Apple ID → ~1,500-2,500 unique podcasts
   c. Batch iTunes Lookup (~10-15 calls of 150 IDs each, 500ms delay between batches)
   d. Upserts Categories from genre data (create if new genre ID, update name if changed)
   e. Upserts Podcasts: match on `appleId`, store typed columns + `appleMetadata` JSON blob, set `language = "en"` as default for US storefront (overwritten with actual value during feed-refresh)
   f. Creates PodcastCategory join records
   g. Populates `categories String[]` from Apple `genres` array (exact name strings, e.g., `["Comedy", "Society & Culture"]`)
   h. Enqueues `FEED_REFRESH_QUEUE.sendBatch()` for all new podcast IDs to pull episodes via RSS

### Subsequent Refreshes

1. Admin triggers catalog refresh (non-destructive)
2. Queue consumer:
   a. Fetches all 19 genre charts → deduplicates → batch lookup (same as seed)
   b. Upserts new podcasts, updates existing ones (metadata, categories, appleMetadata)
   c. For podcasts already in DB but NOT in the new chart results:
      - If active subscriptions exist → keep as `"active"`, no change
      - If no subscriptions and status is `"active"` → set status to `"pending_deletion"`
   d. If a previously `"pending_deletion"` podcast reappears in charts → auto-restore to `"active"`
   e. Podcasts with status `"archived"` are never auto-restored (admin made explicit decision)
   f. Enqueues `FEED_REFRESH_QUEUE.sendBatch()` for active + newly added podcasts (skip pending_deletion and archived)

### Error Handling

- **Apple Charts API failure** (single genre): Log warning, skip that genre, continue with remaining genres. Partial catalog is better than no catalog.
- **iTunes Lookup batch failure**: Retry once after 2-second delay. If still failing, skip that batch and log. Podcasts without lookup data are skipped (no feed URL = can't upsert).
- **iTunes Lookup rate limiting (429/503)**: Back off exponentially (1s, 2s, 4s) up to 3 retries per batch. If exhausted, complete with partial results and log count of skipped podcasts.
- **DB upsert failure**: Log per-podcast, continue with remaining. Report total failures in status.

### Refresh Frequency

Weekly or less. The 19 genre fetches + batch lookups total ~33 API calls with delays, completing in 2-5 minutes within the queue consumer's 15-minute limit.

## Language Handling

- At catalog seed/refresh time, `language` defaults to `"en"` for US storefront podcasts (Apple Charts are country-scoped)
- During feed-refresh, `language` is overwritten with the actual `<language>` tag from the RSS feed (more accurate)
- User-facing browse endpoints filter to `language = "en"` by default
- Admin UI can filter by any language (dropdown populated from distinct values in DB)
- Non-English podcasts exist in the catalog but are excluded from user-facing browse
- English is the only supported language initially (AI pipeline is not multilingual)

## Admin UI Changes

### Filter Sidebar Additions

- **Language filter** — Dropdown populated from distinct `language` values in the DB
- **Category filter** — Multi-select populated from the Category table (replaces unused stub in types)
- **Status filter** — Add `"pending_deletion"` to existing active/paused/archived options

### Catalog Refresh Card

- Show source as "Apple Podcasts"
- Progress indication for the heavier refresh: "Fetching charts... → Resolving metadata... → Upserting podcasts..."
- Post-refresh summary: podcasts added, updated, marked pending_deletion

### Pending Deletion Review

- Quick-filter badge: "X podcasts pending deletion" (similar to existing "issues" toggle)
- Bulk actions via new `POST /api/admin/podcasts/bulk-status` endpoint: `{ podcastIds: string[], status: "active" | "archived" }`. Select multiple → restore to active / archive.
- Auto-restore on next refresh if podcast reappears in charts (only from `pending_deletion`, never from `archived`)

### Podcast Card/Row Updates

- Language badge when not English
- Category chips (first 2-3 with overflow indicator)
- Apple ID link replaces Podcast Index ID display

## User-Facing UI Changes

### New API Endpoint

```
GET /api/podcasts/categories
```

Returns categories with podcast counts, filtered to `language = "en"` and `status = "active"`:

```json
{
  "categories": [
    { "id": "cuid", "name": "Comedy", "podcastCount": 187 },
    { "id": "cuid", "name": "News", "podcastCount": 142 }
  ]
}
```

### Discover Page Changes

- Replace hardcoded `CATEGORIES` const (line 23-26 of `discover.tsx`) with `useFetch` call to `/api/podcasts/categories`
- Category pills populated dynamically from Apple's genre taxonomy
- Filtering logic unchanged — matches against `p.categories[]` which is populated with exact Apple genre name strings (e.g., `["Comedy", "Health & Fitness"]`) during catalog refresh
- No structural UI changes needed

### Categories Endpoint Placement

`GET /api/podcasts/categories` lives in the existing public podcast routes (same file as `/api/podcasts/catalog`). This is a logged-in user endpoint — auth is applied globally to `/api/*` via Clerk middleware.

## Files Created/Modified

### New Files
- `worker/lib/apple-podcasts.ts` — Apple Charts + iTunes Lookup/Search client
- `worker/queues/catalog-refresh.ts` — Queue consumer for catalog seed/refresh

### Modified Files
- `prisma/schema.prisma` — Category model, PodcastCategory model, Podcast field additions
- `worker/lib/catalog-sources.ts` — Updated `DiscoveredPodcast` interface (replace `externalId` with `appleId`/`podcastIndexId`), add `ApplePodcastsSource`
- `worker/routes/admin/podcasts.ts` — Separate seed/refresh endpoints, bulk-status endpoint, pending_deletion flow, remove inline Podcast Index episode fetching (replace with `FEED_REFRESH_QUEUE.sendBatch()`), update stats route `statusMap` to include `pending_deletion: 0`
- `worker/queues/feed-refresh.ts` — Extract `<language>` from RSS during parse, set on Podcast record
- `worker/lib/rss-parser.ts` — Return language field from parsed feed
- `worker/index.ts` — Register catalog-refresh queue consumer
- `worker/types.ts` — Add `CATALOG_REFRESH_QUEUE: Queue<CatalogRefreshMessage>`, parameterize `FEED_REFRESH_QUEUE` as `Queue<FeedRefreshMessage>` for type-safe `sendBatch()`
- `worker/lib/local-queue.ts` — Add `CATALOG_REFRESH_QUEUE` to shim map, add `sendBatch()` to all shimmed queue objects
- `worker/queues/index.ts` — Add `case "catalog-refresh":` branch
- `wrangler.jsonc` — Add `CATALOG_REFRESH_QUEUE` producer and consumer bindings
- `src/pages/admin/catalog.tsx` — Language filter, category filter, pending_deletion status, refresh progress, seed button with confirmation, bulk actions
- `src/pages/discover.tsx` — Dynamic category pills from API
- `src/types/admin.ts` — Update `PodcastStatus` to include `"pending_deletion"`, update `CatalogStats.byStatus`, add `AppleMetadata` interface, add `AdminCategory` type
- `worker/routes/public/podcasts.ts` (or equivalent) — New `/api/podcasts/categories` endpoint

## TypeScript Types

### AppleMetadata Interface

Define a typed interface for the `appleMetadata` JSON column so downstream code doesn't parse blindly:

```typescript
export interface AppleMetadata {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  feedUrl: string;
  releaseDate?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  trackCount?: number;
  country?: string;
  primaryGenreName?: string;
  genreIds?: string[];
  genres?: string[];
  contentAdvisoryRating?: string;
}
```

### Updated Admin Types

In `src/types/admin.ts`:
- `PodcastStatus = "active" | "paused" | "archived" | "pending_deletion"`
- `CatalogStats.byStatus` — add `pending_deletion` key
- `AdminCategory = { id: string; name: string; appleGenreId: string; podcastCount: number }`
- Status map in admin stats route must include `pending_deletion: 0`

## Query Patterns

### Admin Podcast List with Categories

To avoid N+1 queries when showing category chips in the podcast list:

```typescript
const podcasts = await prisma.podcast.findMany({
  include: {
    podcastCategories: { include: { category: { select: { name: true } } } },
    _count: { select: { subscriptions: true } },
  },
});
```

### Categories Endpoint with Counts

Prisma's `_count` on a join table can't filter through nested relations. Use a raw count per category or two queries:

```typescript
// Fetch categories with filtered podcast counts
const categories = await prisma.category.findMany({
  orderBy: { name: "asc" },
});

const counts = await prisma.podcastCategory.groupBy({
  by: ["categoryId"],
  where: {
    podcast: { status: "active", language: "en" },
  },
  _count: true,
});

const countMap = new Map(counts.map((c) => [c.categoryId, c._count]));
const result = categories.map((cat) => ({
  id: cat.id,
  name: cat.name,
  appleGenreId: cat.appleGenreId,
  podcastCount: countMap.get(cat.id) ?? 0,
}));
```

## Design Decisions

1. **Apple as default, Podcast Index as fallback** — Both registered in sources map, configurable via `catalog.source` config key. Podcast Index code stays for safety net. Existing installations must update config from `"podcast-index"` to `"apple"` (or the seed endpoint sets it automatically).
2. **JSON metadata column** — Avoids schema churn for Apple's ~30 fields. Core queryable fields stay as typed columns. `AppleMetadata` TypeScript interface provides type safety for access.
3. **Pending deletion instead of auto-delete** — Admin reviews podcasts that fall off charts before removal. Subscribed podcasts are always preserved. Archived podcasts are never auto-restored.
4. **Language filtering at query time, not ingestion** — Ingest all languages, default to `"en"` at upsert time (US storefront), overwrite with actual RSS `<language>` during feed-refresh. Filter to English in user-facing endpoints.
5. **Category model instead of String[]** — Enables browse-by-category with counts, ordering, and proper querying. `String[]` kept for quick display and client-side filtering (populated with exact Apple genre name strings).
6. **No subcategory hierarchy** — Apple's subcategories are few (9 recently elevated) and not needed for initial browse experience.
7. **Queue-based execution** — Catalog refresh runs in a queue consumer (15-min limit) rather than the HTTP handler (30-sec limit). HTTP handler returns immediately after enqueuing.
8. **Separate seed vs. refresh** — Destructive wipe is a distinct endpoint with confirmation guard, never triggered by routine refresh.
9. **Source-specific external IDs** — `DiscoveredPodcast` uses `appleId`/`podcastIndexId` fields instead of generic `externalId` to prevent cross-source ID collisions.
