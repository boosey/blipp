# Catalog & Episode Management Improvements

## Context

Blipp's catalog management is minimal: seeding is hardcoded to 200 podcasts from Podcast Index, feed refresh only checks subscribed podcasts, there's no episode cleanup, no user podcast requests, and the Podcast Index dependency is hardcoded throughout. This plan adds configurable catalog management, episode lifecycle controls, user podcast requests, and pluggable provider abstractions.

## Decisions Made

- **User requests**: Search by name (primary) + paste feed URL (advanced fallback)
- **Episode detection**: Refresh ALL catalog podcasts, not just subscribed ones
- **Episode aging**: Hard delete with R2 cleanup (no soft archive)
- **Transcript sources**: Build pluggable interface, implement only Podcast Index now

---

## Phase 1: Schema & Config Foundation

### 1.1 Prisma Schema Changes

**File:** `prisma/schema.prisma`

**New model — `PodcastRequest`:**
```prisma
model PodcastRequest {
  id          String               @id @default(cuid())
  userId      String
  feedUrl     String
  title       String?
  imageUrl    String?
  status      PodcastRequestStatus @default(PENDING)
  podcastId   String?
  adminNote   String?
  reviewedBy  String?
  reviewedAt  DateTime?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  podcast Podcast? @relation(fields: [podcastId], references: [id])

  @@unique([userId, feedUrl])
}

enum PodcastRequestStatus {
  PENDING
  APPROVED
  REJECTED
  DUPLICATE
}
```

**Modify `Podcast` model:** Add `source String?` field (values: `"trending"`, `"user_request"`, `"manual"`) and `requests PodcastRequest[]` relation.

**Modify `User` model:** Add `podcastRequests PodcastRequest[]` relation.

### 1.2 New PlatformConfig Keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------
| `catalog.seedSize` | number | 200 | Podcasts to fetch during catalog-refresh |
| `catalog.source` | string | `"podcast-index"` | Active discovery source |
| `catalog.refreshAllPodcasts` | boolean | true | Refresh all catalog vs subscribers only |
| `catalog.requests.enabled` | boolean | true | Allow user podcast requests |
| `catalog.requests.maxPerUser` | number | 5 | Max pending requests per user |
| `catalog.cleanup.enabled` | boolean | false | Enable cleanup suggestions |
| `catalog.cleanup.intervalDays` | number | 30 | How often to compute candidates |
| `catalog.cleanup.inactivityThresholdDays` | number | 90 | Days inactive before suggesting removal |
| `catalog.cleanup.lastRunAt` | string\|null | null | Last cleanup computation timestamp |
| `episodes.aging.enabled` | boolean | false | Enable episode aging |
| `episodes.aging.intervalDays` | number | 30 | How often to check for aged episodes |
| `episodes.aging.maxAgeDays` | number | 180 | Age threshold for deletion candidates |
| `episodes.aging.lastRunAt` | string\|null | null | Last aging computation timestamp |
| `transcript.sources` | string[] | `["rss-feed","podcast-index"]` | Ordered transcript lookup sources |

### 1.3 Admin Types

**File:** `src/types/admin.ts` — Add `AdminPodcastRequest`, `CleanupCandidate`, `AgingCandidate` types.

---

## Phase 2: Provider Abstractions

### 2.1 Catalog Source Abstraction

**New file:** `worker/lib/catalog-sources.ts`

```typescript
export interface CatalogSource {
  name: string;
  identifier: string;
  discover(count: number, env: Env): Promise<DiscoveredPodcast[]>;
  search(query: string, env: Env): Promise<DiscoveredPodcast[]>;
}

export interface DiscoveredPodcast {
  feedUrl: string;
  title: string;
  description?: string;
  imageUrl?: string;
  author?: string;
  externalId?: string;
}
```

- Implement `PodcastIndexSource` wrapping existing `PodcastIndexClient` (`worker/lib/podcast-index.ts`)
- `discover()` wraps `client.trending(count)`
- `search()` wraps `client.search(query)` (already exists on the client)
- Registry: `Map<string, CatalogSource>` with `getCatalogSource(id)` getter
- Follows same pattern as `stt-providers.ts`

**Refactor:** `worker/routes/admin/podcasts.ts` catalog-refresh endpoint:
- Read `catalog.seedSize` and `catalog.source` from PlatformConfig
- Use `getCatalogSource(sourceId).discover(seedSize, env)` instead of hardcoded `client.trending(200)`

### 2.2 Transcript Source Abstraction

**New file:** `worker/lib/transcript-sources.ts`

```typescript
export interface TranscriptSource {
  name: string;
  identifier: string;
  lookup(ctx: TranscriptLookupContext, env: Env): Promise<string | null>;
}

export interface TranscriptLookupContext {
  episodeGuid: string;
  episodeTitle: string;
  podcastTitle: string;
  podcastIndexId: string | null;
  feedUrl: string;
}
```

- `RssFeedTranscriptSource` — returns `episode.transcriptUrl` if set (always first, hardcoded)
- `PodcastIndexTranscriptSource` — wraps existing `lookupPodcastIndexTranscript()` from `worker/lib/transcript-source.ts`
- Registry: `Map<string, TranscriptSource>` with getter

**Refactor:** `worker/queues/transcription.ts` waterfall:
- Read `transcript.sources` config (ordered array)
- Always prepend `"rss-feed"` (cannot be removed)
- Iterate sources, first non-null result wins
- STT fallback remains unchanged (separately configured via `ai.stt.model`)

---

## Phase 3: User Podcast Requests

### 3.1 User-Facing Routes

**File:** `worker/routes/podcasts.ts` (add to existing file)

- `POST /request` — Submit podcast request
  - Body: `{ feedUrl: string, title?: string }` (for paste-URL flow)
  - Checks `catalog.requests.enabled` and `catalog.requests.maxPerUser`
  - Returns 409 if feed already in catalog (with podcastId so user can subscribe directly)
  - Returns 409 if user already has pending request for this feed
  - Creates `PodcastRequest` with status PENDING

- `POST /search-podcasts` — Search for podcasts to request
  - Body: `{ query: string }`
  - Uses `getCatalogSource(sourceId).search(query, env)`
  - Returns discovered podcasts with `inCatalog: boolean` flag
  - If already in catalog, returns the existing podcastId

- `GET /requests` — List user's own requests

- `DELETE /request/:id` — Cancel a pending request

### 3.2 Admin Routes

**File:** `worker/routes/admin/podcasts.ts` (add to existing)

- `GET /requests` — List all requests with pagination, filter by status
- `GET /requests/stats` — Count by status (pending/approved/rejected)
- `POST /requests/:id/approve` — Approve:
  1. Fetch RSS feed, parse metadata
  2. Upsert podcast with `source: "user_request"`
  3. Fetch initial episodes (reuse catalog-refresh per-podcast logic)
  4. Update request → APPROVED, set podcastId
- `POST /requests/:id/reject` — Reject with optional adminNote

### 3.3 Frontend

**User side — `src/pages/discover.tsx`** (or new component):
- "Request a Podcast" button near search
- Opens modal with search-by-name field (calls `/search-podcasts`)
- Results show: podcast info + "Already in catalog" badge or "Request" button
- Expandable "Have a feed URL?" section for advanced users
- "My Requests" section showing pending/approved/rejected status

**Admin side — `src/pages/admin/catalog.tsx`:**
- New "Requests" tab showing pending requests table
- Approve/reject actions with optional admin note

---

## Phase 4: Catalog Cleanup & Episode Aging

### 4.1 Cleanup Candidates

**File:** `worker/routes/admin/podcasts.ts`

- `GET /cleanup-candidates` — Computes on-the-fly (no persistent table):
  - Podcasts with zero active subscriptions AND no feed items in last N days (`catalog.cleanup.inactivityThresholdDays`)
  - Returns per podcast: title, source, current subscriber count (0), current request count, last feed item date, last subscription date, lifetime total feed items, lifetime total clips generated
  - Sorted by staleness (longest inactive first)

- `POST /cleanup-execute` — Admin selects podcasts to archive
  - Body: `{ podcastIds: string[] }`
  - Sets `status: "archived"` (does NOT hard-delete podcasts, just marks them inactive)
  - Archived podcasts excluded from future feed refresh and catalog display

### 4.2 Episode Aging

**File:** `worker/routes/admin/episodes.ts`

- `GET /aging-candidates` — Episodes older than `episodes.aging.maxAgeDays`:
  - No PENDING/PROCESSING feed items referencing them
  - Returns: episode title, podcast title, published date, age in days, clip count, has distillation, estimated R2 storage
  - Sorted by age (oldest first)

- `POST /aging-execute` — Hard delete selected episodes:
  - Body: `{ episodeIds: string[] }`
  - **Order matters for cascade:**
    1. Query WorkProducts and Clip audioKeys for R2 keys
    2. Delete R2 objects (`env.R2.delete(key)`)
    3. Delete episodes from Postgres (Prisma cascades: distillations, clips, feedItems, pipelineJobs, workProducts)
  - Returns count of deleted episodes and R2 objects cleaned

### 4.3 Scheduled Handler Additions

**File:** `worker/queues/index.ts` — Add after existing pricing refresh block:

```
// Catalog cleanup check
if catalog.cleanup.enabled AND interval elapsed since lastRunAt:
  → compute candidate count
  → cache to PlatformConfig: catalog.cleanup.lastCandidateCount
  → update catalog.cleanup.lastRunAt
  (lightweight query, no queue needed)

// Episode aging check
if episodes.aging.enabled AND interval elapsed since lastRunAt:
  → compute candidate count
  → cache to PlatformConfig: episodes.aging.lastCandidateCount
  → update episodes.aging.lastRunAt
```

These just compute counts so the admin dashboard can show badges like "12 cleanup candidates" and "47 aged episodes". The actual candidate lists are computed fresh when the admin views the page.

### 4.4 Feed Refresh Scope Change

**File:** `worker/queues/feed-refresh.ts`

When triggered by cron with `catalog.refreshAllPodcasts = true`:
- Refresh ALL non-archived podcasts (not just those with subscribers)
- This keeps the discovery catalog fresh with new episodes

---

## Phase 5: Admin Configuration UI

**File:** `src/pages/admin/configuration.tsx`

Add 5th tab: **"Catalog & Episodes"** with sections:

1. **Catalog Seeding** — Seed size (number input), Source (dropdown, only "Podcast Index" for now)
2. **Podcast Requests** — Enabled toggle, max per user input
3. **Catalog Cleanup** — Enabled toggle, interval days, inactivity threshold days, last run info + candidate count badge
4. **Episode Aging** — Enabled toggle, interval days, max age days, last run info + candidate count badge
5. **Episode Detection** — Refresh all toggle, refresh interval (reuses existing `pipeline.minIntervalMinutes`)
6. **Transcript Sources** — Ordered list of enabled sources with up/down reorder controls

---

## Phase 6: Documentation

Update these docs to reflect changes:
- `docs/data-model.md` — PodcastRequest model, Podcast.source field
- `docs/api-reference.md` — New endpoints (user requests, admin cleanup/aging, search)
- `docs/architecture.md` — Provider abstraction pattern
- `docs/admin-platform.md` — New admin features

---

## Critical Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | PodcastRequest model, Podcast.source, User relation |
| `worker/lib/catalog-sources.ts` | **New** — CatalogSource interface + PodcastIndexSource |
| `worker/lib/transcript-sources.ts` | **New** — TranscriptSource interface + registry |
| `worker/lib/transcript-source.ts` | Existing — wrappable by new abstraction |
| `worker/lib/podcast-index.ts` | Existing — reused by PodcastIndexSource |
| `worker/lib/stt-providers.ts` | Existing — pattern to follow for both abstractions |
| `worker/lib/config.ts` | Existing — `getConfig()` used for all new config keys |
| `worker/routes/admin/podcasts.ts` | Refactor catalog-refresh, add requests/cleanup endpoints |
| `worker/routes/admin/episodes.ts` | Add aging endpoints |
| `worker/routes/podcasts.ts` | Add user request + search routes |
| `worker/queues/index.ts` | Add cleanup/aging checks to scheduled handler |
| `worker/queues/feed-refresh.ts` | Refresh all catalog podcasts (not just subscribed) |
| `worker/queues/transcription.ts` | Refactor to use TranscriptSource waterfall |
| `src/pages/admin/configuration.tsx` | Add "Catalog & Episodes" tab |
| `src/pages/admin/catalog.tsx` | Add "Requests" tab, cleanup candidates section |
| `src/pages/discover.tsx` | Add podcast request flow (search + URL paste) |
| `src/types/admin.ts` | New types for requests, cleanup, aging |

## Verification

1. **Schema**: `npx prisma db push` succeeds, `npx prisma generate` succeeds
2. **Catalog refresh**: Admin can set seed size to 50 in config, run catalog-refresh, verify only 50 podcasts fetched
3. **User requests**: User searches for a podcast, requests it, admin approves, podcast appears in catalog
4. **Feed refresh scope**: After cron trigger, verify episodes updated for non-subscribed podcasts
5. **Cleanup candidates**: Set inactivity threshold to 1 day, verify stale podcasts appear in candidates list
6. **Episode aging**: Set max age to 1 day, verify old episodes appear as candidates, approve deletion, verify R2 cleanup
7. **Transcript sources**: Change source order in config, verify waterfall follows new order
8. **Typecheck**: `npm run typecheck` passes
9. **Tests**: Existing tests pass, new routes have test coverage
