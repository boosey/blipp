# Subscriptions & On-Demand Briefings Design

## Overview

Two ways for users to get podcast briefings (one episode, one time tier):

1. **Subscriptions** — Subscribe to a podcast with a chosen duration tier. The latest episode is immediately briefed, and all future episodes are auto-briefed and delivered to the user's feed.
2. **On-demand** — Request a one-off briefing of a specific episode (or latest from a podcast) at a chosen duration tier, without subscribing.

Both produce individual clips that appear in a unified feed with listened/unlistened tracking.

---

## Data Model

### Modified: Subscription

Add `durationTier` and `updatedAt`:

```prisma
model Subscription {
  id           String   @id @default(cuid())
  userId       String
  podcastId    String
  durationTier Int      // 1, 2, 3, 5, 7, 10, or 15 (minutes)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  podcast Podcast @relation(fields: [podcastId], references: [id], onDelete: Cascade)

  @@unique([userId, podcastId])
}
```

### New: FeedItem

Per-user delivery and consumption tracking. Links to a shared Clip once the pipeline completes.

```prisma
model FeedItem {
  id           String         @id @default(cuid())
  userId       String
  episodeId    String
  podcastId    String
  clipId       String?        // null while pipeline is processing
  durationTier Int
  source       FeedItemSource // SUBSCRIPTION or ON_DEMAND
  status       FeedItemStatus // PENDING, PROCESSING, READY, FAILED
  listened     Boolean        @default(false)
  listenedAt   DateTime?
  requestId    String?        // FK to BriefingRequest (pipeline tracking)
  errorMessage String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  podcast Podcast @relation(fields: [podcastId], references: [id], onDelete: Cascade)

  @@unique([userId, episodeId, durationTier])
}

enum FeedItemSource {
  SUBSCRIPTION
  ON_DEMAND
}

enum FeedItemStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}
```

Multiple users subscribing to the same podcast at the same tier share the same Clip — FeedItem is the per-user delivery layer.

### Relations added

- `User.feedItems` → FeedItem[]
- `Episode.feedItems` → FeedItem[]
- `Podcast.feedItems` → FeedItem[]

### Models removed

- `Briefing` — replaced by FeedItem (one episode, one tier)
- `BriefingSegment` — unnecessary (briefings are single-clip, not multi-segment)
- `BriefingStatus` enum

### User fields removed

- `briefingLengthMinutes` — each subscription/on-demand has its own tier
- `briefingTime` — relevant to future digest scheduling
- `timezone` — same, digest-related

### Models kept

- `BriefingRequest`, `PipelineJob`, `PipelineStep`, `WorkProduct` — still drive clip production
- `Clip`, `Distillation` — shared cached artifacts

---

## Subscription Flow

### Subscribe

`POST /api/podcasts/subscribe`

```
Body: { feedUrl, title, durationTier, description?, imageUrl?, podcastIndexId?, author? }
```

1. Upsert podcast record (create if new from search, update metadata if exists)
2. Create/update Subscription with `durationTier`
3. Find the latest episode for that podcast
4. Create a FeedItem (source: `SUBSCRIPTION`, status: `PENDING`)
5. Create a BriefingRequest and dispatch to orchestrator

### Update subscription tier

`PATCH /api/podcasts/subscribe/:podcastId`

```
Body: { durationTier }
```

Updates `durationTier` on existing subscription. Does NOT retroactively regenerate past clips.

### Unsubscribe

`DELETE /api/podcasts/subscribe/:podcastId` — deletes Subscription. FeedItems already delivered remain in the user's feed.

### Auto-delivery on new episodes

During feed refresh, after ingesting new episodes:

1. For each new episode, query Subscription records for that podcast
2. For each subscriber, create a FeedItem (`SUBSCRIPTION`, `PENDING`) using the subscriber's `durationTier`
3. Group subscribers by `durationTier` to create the minimum number of BriefingRequests (one per unique tier — the pipeline produces one Clip per `[episodeId, durationTier]`)
4. Dispatch each BriefingRequest to orchestrator

Feed refresh only processes podcasts that have at least one subscriber.

---

## On-Demand Flow

### Endpoint

`POST /api/briefings/generate` — rewritten for on-demand only:

```
Body: { podcastId, episodeId?, durationTier }
```

- `durationTier` is required
- If `episodeId` provided, use that specific episode
- If only `podcastId`, resolve to the latest episode
- Creates a FeedItem (source: `ON_DEMAND`, status: `PENDING`)
- Creates a BriefingRequest and dispatches to orchestrator
- `@@unique([userId, episodeId, durationTier])` prevents duplicate requests

---

## Feed API

### List feed

`GET /api/feed?status=READY&listened=false&limit=30&offset=0`

Returns FeedItems with nested podcast/episode/clip data:

```json
{
  "items": [
    {
      "id": "...",
      "source": "SUBSCRIPTION",
      "status": "READY",
      "listened": false,
      "durationTier": 5,
      "createdAt": "...",
      "podcast": { "id": "...", "title": "...", "imageUrl": "..." },
      "episode": { "id": "...", "title": "...", "publishedAt": "..." },
      "clip": { "audioUrl": "...", "actualSeconds": 300 }
    }
  ],
  "total": 42
}
```

### Mark listened

`PATCH /api/feed/:id/listened` — sets `listened: true`, `listenedAt: now()`.

### Feed counts

`GET /api/feed/counts` — returns `{ total, unlistened, pending }` for UI badges.

---

## Pipeline Completion Callback

When the orchestrator finishes a BriefingRequest (all jobs complete), update all FeedItems linked to that `requestId`:

- **Success:** Set `status: READY` and `clipId` to the produced Clip
- **Failure:** Set `status: FAILED` and `errorMessage`

---

## Routes Removed/Replaced

| Old | New |
|-----|-----|
| `GET /api/briefings/` | `GET /api/feed` |
| `GET /api/briefings/today` | Removed |
| `POST /api/briefings/generate` | Rewritten (on-demand only) |
| `GET /api/briefings/preferences` | Removed |
| `PATCH /api/briefings/preferences` | Removed |

---

## Future Considerations

- **Digests:** Will bundle multiple FeedItems/briefings into a single assembled audio. Separate design.
- **Personalized ads:** FeedItem can be paired with an ad in the future (e.g., `adId` or `adAudioUrl` field).
- **Tier limits:** Free-tier usage limits to be revisited in a separate design.
