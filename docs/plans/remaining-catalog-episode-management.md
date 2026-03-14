# Remaining Catalog & Episode Management Features

**Date:** 2026-03-14
**Status:** Not yet implemented — standalone feature work
**Source:** [Original Plan](./2026-03-14-catalog-episode-management.md)
**Relationship:** Items here are FEATURE work, not SaaS readiness gaps. Data retention (episode aging + catalog cleanup) overlaps with [Remaining SaaS Gaps](./remaining-saas-gaps.md) item #9.

---

## What This Plan Covers

These are product features that improve catalog management, user experience, and content lifecycle. None are launch blockers — they enhance the platform after the core product is working.

---

## Feature 1: User Podcast Requests

**Priority:** Medium — enables user-driven catalog growth
**Effort:** 2-3 days

Users can request podcasts not yet in the catalog. Admins review and approve/reject.

### What to build:
- **Schema:** `PodcastRequest` model (userId, feedUrl, title, status, adminNote)
- **User routes:** `POST /api/podcasts/request`, `POST /api/podcasts/search-podcasts`, `GET /api/podcasts/requests`, `DELETE /api/podcasts/request/:id`
- **Admin routes:** `GET /admin/podcasts/requests`, `POST /admin/podcasts/requests/:id/approve`, `POST /admin/podcasts/requests/:id/reject`
- **Frontend:** "Request a Podcast" in discover page, "My Requests" list, admin requests tab in catalog page
- **Config keys:** `catalog.requests.enabled`, `catalog.requests.maxPerUser`

### Dependencies:
- None — can be built independently

---

## Feature 2: Catalog Source Abstraction

**Priority:** Low — only needed when adding a second podcast discovery source
**Effort:** 1 day

Make podcast discovery pluggable (currently hardcoded to Podcast Index).

### What to build:
- **New file:** `worker/lib/catalog-sources.ts` — `CatalogSource` interface with `discover()` and `search()` methods
- **Implementation:** `PodcastIndexSource` wrapping existing `PodcastIndexClient`
- **Refactor:** `worker/routes/admin/podcasts.ts` catalog-refresh to use the abstraction
- **Config keys:** `catalog.seedSize`, `catalog.source`

### Dependencies:
- None — refactoring only, no new features exposed to users

---

## Feature 3: Transcript Source Abstraction

**Priority:** Low — only needed when adding a third transcript source
**Effort:** 1 day

Make transcript lookup pluggable (currently hardcoded RSS → Podcast Index → STT waterfall).

### What to build:
- **New file:** `worker/lib/transcript-sources.ts` — `TranscriptSource` interface with ordered registry
- **Implementations:** `RssFeedTranscriptSource`, `PodcastIndexTranscriptSource`
- **Refactor:** `worker/queues/transcription.ts` waterfall to iterate registered sources
- **Config key:** `transcript.sources` (ordered array)

### Dependencies:
- None — refactoring only

---

## Feature 4: Catalog Cleanup

**Priority:** Medium — prevents catalog bloat
**Effort:** 1 day
**Overlaps with:** [Remaining SaaS Gaps](./remaining-saas-gaps.md) item #9 (Data Retention)

Admin tool to identify and archive stale podcasts with no subscribers.

### What to build:
- **Admin endpoint:** `GET /admin/podcasts/cleanup-candidates` — podcasts with 0 subscribers and no activity in N days
- **Admin endpoint:** `POST /admin/podcasts/cleanup-execute` — archive selected podcasts (set `status: "archived"`)
- **Scheduled check:** Compute candidate count periodically, show badge in admin dashboard
- **Config keys:** `catalog.cleanup.enabled`, `catalog.cleanup.intervalDays`, `catalog.cleanup.inactivityThresholdDays`

### Dependencies:
- None

---

## Feature 5: Episode Aging & R2 Cleanup

**Priority:** Medium-High — manages storage costs
**Effort:** 1-2 days
**Overlaps with:** [Remaining SaaS Gaps](./remaining-saas-gaps.md) item #9 (Data Retention)

Admin tool to identify and hard-delete old episodes with their R2 artifacts.

### What to build:
- **Admin endpoint:** `GET /admin/episodes/aging-candidates` — episodes older than N days with no pending feed items
- **Admin endpoint:** `POST /admin/episodes/aging-execute` — hard delete episodes + R2 cleanup (transcripts, claims, narratives, clips)
- **Deletion order:** Query R2 keys from WorkProducts/Clips → delete R2 objects → delete episodes (Prisma cascades the rest)
- **Scheduled check:** Compute candidate count periodically
- **Config keys:** `episodes.aging.enabled`, `episodes.aging.intervalDays`, `episodes.aging.maxAgeDays`

### Dependencies:
- None

---

## Feature 6: Feed Refresh Scope Change

**Priority:** Low — only matters when catalog has many non-subscribed podcasts
**Effort:** 0.5 day

Refresh ALL non-archived podcasts during cron, not just those with subscribers. Keeps the discovery catalog fresh.

### What to build:
- **Modify:** `worker/queues/feed-refresh.ts` — when `catalog.refreshAllPodcasts = true`, query all non-archived podcasts instead of only those with subscribers
- **Config key:** `catalog.refreshAllPodcasts`

### Dependencies:
- None

---

## Feature 7: Podcast Source Tracking

**Priority:** Low — useful for analytics
**Effort:** 0.5 day

Track how each podcast entered the catalog.

### What to build:
- **Schema:** Add `source String?` field to Podcast model (values: "trending", "user_request", "manual")
- **Update:** Catalog refresh sets `source: "trending"`, podcast request approval sets `source: "user_request"`, manual admin add sets `source: "manual"`

### Dependencies:
- Feature 1 (User Podcast Requests) for the "user_request" value

---

## Feature 8: Admin Configuration UI Tab

**Priority:** Low — admin can use existing config CRUD
**Effort:** 1 day

Dedicated "Catalog & Episodes" tab in admin configuration page.

### What to build:
- **Frontend:** New tab in `src/pages/admin/configuration.tsx` with sections for catalog seeding, podcast requests, cleanup, episode aging, transcript sources
- **UX:** Number inputs, toggles, ordered list for transcript sources

### Dependencies:
- Features 1-6 (the config keys must exist to configure)

---

## Recommended Implementation Order

| Order | Feature | Effort | Why |
|-------|---------|--------|-----|
| 1 | Feature 5 (Episode Aging) | 1-2d | Manages storage costs — most impactful operationally |
| 2 | Feature 4 (Catalog Cleanup) | 1d | Prevents catalog bloat |
| 3 | Feature 1 (User Podcast Requests) | 2-3d | Enables user-driven growth |
| 4 | Feature 6 (Feed Refresh Scope) | 0.5d | Quick win for catalog freshness |
| 5 | Feature 7 (Source Tracking) | 0.5d | Quick win for analytics |
| 6 | Features 2+3 (Provider Abstractions) | 2d | Only when second source is needed |
| 7 | Feature 8 (Admin UI Tab) | 1d | After features are built |

**Total estimated effort:** 8-10 days
