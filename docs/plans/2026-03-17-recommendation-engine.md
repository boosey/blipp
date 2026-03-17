# Personalized Podcast Recommendation Engine

## Context

Blipp's Discover page is purely generic — trending by episode count, category browsing, and search. There's no personalization. Users already generate rich signals (subscriptions, favorites, listening history, duration preferences) and the pipeline already extracts semantic data (claims with importance/novelty scores). This plan builds a recommendation engine that leverages those existing signals and data, starting cheap (zero AI cost) and layering on semantic intelligence.

## Architecture Overview

**Two-layer scoring system:**

1. **Category Affinity** (Phase 1, zero AI cost) — Weighted category vector per user from subscriptions/favorites/listens, scored against podcast category vectors via cosine similarity.

2. **Topic Fingerprinting** (Phase 2, ~$1/month AI cost) — Extract topic tags from distillation claims per podcast via a single batch LLM call. Users get topic profiles from their consumed podcasts. Score via Jaccard similarity.

**Three precomputed tables:**
- `PodcastProfile` — Per-podcast: category weights, topic tags, popularity, freshness. Computed in batch.
- `UserProfile` — Per-user: aggregated category weights + topic tags. Computed on subscription/listen events.
- `RecommendationCache` — Per-user: ranked top-20 podcast list with scores + reason strings. Computed async after profile changes.

**Why precompute instead of on-demand?** CF Workers have 30s CPU limit on fetch handlers. A single DB read for cached results keeps API response under 10ms.

---

## Phase 1: Category-Based Recommendations (zero AI cost)

### 1.1 Schema Changes

Add to `prisma/schema.prisma`:

```prisma
model PodcastProfile {
  id              String   @id @default(cuid())
  podcastId       String   @unique
  categoryWeights Json     // { "Technology": 0.8, "Business": 0.3 }
  topicTags       String[] // Phase 2: ["AI", "startups"]
  popularity      Float    @default(0) // Normalized 0-1
  freshness       Float    @default(0) // Normalized 0-1
  subscriberCount Int      @default(0)
  computedAt      DateTime @default(now())
  podcast         Podcast  @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  @@index([computedAt])
}

model UserRecommendationProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  categoryWeights Json     // { "Technology": 0.9, "Science": 0.5 }
  topicTags       String[] // Phase 2
  listenCount     Int      @default(0)
  computedAt      DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model RecommendationCache {
  id         String   @id @default(cuid())
  userId     String   @unique
  podcasts   Json     // [{ podcastId, score, reasons: string[] }]
  computedAt DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Run `npx prisma db push` after adding.

### 1.2 Scoring Algorithm

```
Score(user, podcast) =
    0.40 * categoryAffinity(user.categoryWeights, podcast.categoryWeights)
  + 0.35 * popularity
  + 0.15 * freshness
  + 0.10 * subscriberOverlap  // bonus if other subscribers of this podcast share user's subscriptions
```

- **categoryAffinity**: Cosine similarity of two category weight objects
- **popularity**: `subscriberCount / maxSubscriberCount` (normalized across catalog)
- **freshness**: `max(0, 1 - daysSinceLastEpisode / 30)`
- Exclude already-subscribed podcasts
- Penalize (but don't exclude) already-favorited podcasts

All weights config-driven via PlatformConfig.

### 1.3 Cold Start

| User State | Strategy |
|---|---|
| 0 subscriptions | Global popularity ranking (same as current trending) |
| 1-2 subscriptions | Category affinity from those podcasts, popularity-weighted |
| 3+ subscriptions | Full scoring engine |

Response includes `source: "personalized" | "popular"` so the UI can label accordingly.

### 1.4 Backend Files

**New files:**

| File | Purpose |
|---|---|
| `worker/lib/recommendations.ts` | Core scoring logic: `computePodcastProfiles()`, `computeUserProfile()`, `scoreRecommendations()`, `cosineSimilarity()` |
| `worker/routes/recommendations.ts` | Public API: `GET /recommendations`, `GET /recommendations/similar/:podcastId` |
| `worker/routes/admin/recommendations.ts` | Admin API: stats, recompute trigger, config |

**Modified files:**

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 3 new models |
| `worker/routes/podcasts.ts` | After subscribe/unsubscribe/favorite: call `recomputeUserProfile()` + invalidate cache |
| `worker/routes/feed.ts` | After marking listened: call `recomputeUserProfile()` |
| `worker/routes/admin/index.ts` | Mount recommendations admin routes |
| `worker/index.ts` | Mount `/api/recommendations` routes |
| `worker/queues/index.ts` | Add weekly PodcastProfile refresh to cron handler |
| `src/pages/discover.tsx` | Add "For You" section |

### 1.5 API Endpoints

```
GET /api/recommendations
  → { recommendations: [{ podcast: CatalogPodcast, score, reasons: string[] }], source }
  Reads from RecommendationCache. Falls back to popular if no profile.

GET /api/recommendations/similar/:podcastId
  → { similar: [{ podcast: CatalogPodcast, score }] }
  On-demand: scores all PodcastProfiles against target podcast's profile.

GET /api/admin/recommendations/stats
  → { usersWithProfiles, podcastsWithProfiles, cacheHitRate, lastComputeAt }

POST /api/admin/recommendations/recompute
  → { queued: true }  // Triggers full PodcastProfile + all UserProfile recompute
```

### 1.6 Frontend — "For You" Section

Insert in `src/pages/discover.tsx` between "Trending Now" and "Browse All":

```
[Category Pills]
[Trending Now]        ← existing horizontal scroll
[For You]             ← NEW horizontal scroll, same card style
[Browse All]          ← existing grid
```

- Fetch via `useFetch<RecommendationResponse>("/recommendations")`
- Show top 8 as horizontal scroll cards (same style as trending)
- Each card shows a small reason pill ("Similar to Pod X" / "Popular in Tech")
- If `source === "popular"`, label section "Popular" instead of "For You"
- Skeleton loader while fetching

### 1.7 Profile Computation Triggers

User action → synchronous inline call (fast, pure DB):

| Trigger | What runs |
|---|---|
| Subscribe to podcast | `recomputeUserProfile(userId)` → `recomputeRecommendationCache(userId)` |
| Unsubscribe | Same |
| Toggle favorite | Same |
| Mark briefing listened | Same |
| Cron (weekly) | `recomputeAllPodcastProfiles()` — recalc popularity + freshness |

`recomputeUserProfile()` loads the user's subscribed + favorited podcast profiles, merges category weights (subscription=1.0, favorite=0.7, listened=0.3), and upserts.

`recomputeRecommendationCache()` loads all PodcastProfiles (~200 rows), scores each, takes top 20, stores with reason strings.

Both are fast (< 50ms) — no AI calls, just DB reads + math.

---

## Phase 2: Topic Fingerprinting (~$1/month AI cost)

### 2.1 Topic Extraction

**New file:** `worker/lib/topic-extraction.ts`

For each podcast with distilled episodes:
1. Load 3-5 most recent claims WorkProducts from R2
2. Concatenate claim text (just `claim` fields, ~500 tokens)
3. Single LLM call (Claude Haiku): "Extract 10-20 topic tags from these claims. Return JSON array."
4. Store in `PodcastProfile.topicTags`

**Cost:** ~200 podcasts × ~500 input tokens × $0.25/MTok (Haiku) ≈ $0.025 per full recompute. Weekly = ~$0.10/month.

### 2.2 Enhanced Scoring

Weights shift to include topic similarity:

```
Score(user, podcast) =
    0.30 * categoryAffinity
  + 0.30 * topicSimilarity   ← NEW
  + 0.25 * popularity
  + 0.10 * freshness
  + 0.05 * subscriberOverlap
```

**topicSimilarity**: Jaccard index — `|intersection(userTopics, podcastTopics)| / |union(...)|`

User's `topicTags` = union of topic tags from subscribed/favorited/listened podcasts.

### 2.3 Richer Reason Strings

Replace generic "Popular in Technology" with:
- "Covers AI and machine learning, like [Lex Fridman]"
- "Deep dives into startup culture — matches your interests"

Template-driven from the dominant matching signal.

### 2.4 "Similar Podcasts" on Podcast Detail

Add to the podcast detail sheet/page, below description:

```
[Podcast Header]
[Description]
[Similar Podcasts]    ← NEW horizontal scroll, 5-6 cards
[Episodes]
```

Uses `GET /recommendations/similar/:podcastId` — scores by category + topic overlap.

### 2.5 Distillation Hook

In `worker/queues/distillation.ts`, after successful distillation:
- Check if PodcastProfile.topicTags is stale (> 7 days or empty)
- If so, run topic extraction inline (single LLM call, < 5s)
- Upsert PodcastProfile

This keeps topic tags fresh as new episodes are distilled without a separate queue.

---

## Phase 3: Behavioral Refinement (future, deferred)

Not planned for implementation now, but the architecture supports:

- **Dismissal signals**: `POST /recommendations/dismiss/:podcastId` — suppress from future recommendations
- **Feed interstitials**: Recommendation cards between feed items
- **Collaborative filtering**: "Users who subscribe to X also subscribe to Y" (needs larger user base)
- **Listen-through rate**: Track how much of a briefing was played (needs audio player events)
- **Embeddings**: OpenAI/Cohere embeddings on podcast descriptions for finer similarity (needs vector storage)
- **A/B testing**: Compare scoring weights via user segments

---

## Config Keys (PlatformConfig)

```
recommendations.enabled                   = true
recommendations.weights.category          = 0.40  (Phase 1) → 0.30  (Phase 2)
recommendations.weights.topic             = 0.00  (Phase 1) → 0.30  (Phase 2)
recommendations.weights.popularity        = 0.35  (Phase 1) → 0.25  (Phase 2)
recommendations.weights.freshness         = 0.15  (Phase 1) → 0.10  (Phase 2)
recommendations.weights.subscriberOverlap = 0.10  (Phase 1) → 0.05  (Phase 2)
recommendations.coldStart.minSubscriptions = 3
recommendations.topicExtraction.model     = { provider: "anthropic", model: "claude-haiku-4-5-20251001" }
recommendations.cache.maxResults          = 20
recommendations.profile.refreshIntervalDays = 7
```

---

## Verification Plan

1. **Schema**: `npx prisma db push` — verify 3 new tables created
2. **PodcastProfile computation**: Trigger via admin endpoint, verify all catalog podcasts get profiles with category weights + popularity
3. **User profile**: Subscribe to 3 podcasts → verify UserRecommendationProfile created with merged category weights
4. **Recommendations API**: `GET /api/recommendations` → verify returns ranked list excluding subscribed podcasts
5. **Similar podcasts**: `GET /api/recommendations/similar/:id` → verify returns podcasts with overlapping categories
6. **Cold start**: New user with 0 subscriptions → verify fallback to popular
7. **UI**: Discover page shows "For You" section between Trending and Browse All
8. **Admin**: Stats endpoint returns profile counts and cache hit rate
9. **Cron**: Verify weekly PodcastProfile refresh runs and updates popularity/freshness
10. **Phase 2**: After topic extraction, verify topicTags populated and scoring shifts

---

## Critical Files

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add PodcastProfile, UserRecommendationProfile, RecommendationCache |
| `worker/lib/recommendations.ts` | NEW — scoring logic, profile computation |
| `worker/routes/recommendations.ts` | NEW — public API |
| `worker/routes/admin/recommendations.ts` | NEW — admin API |
| `worker/routes/podcasts.ts` | Hook subscribe/unsubscribe/favorite events |
| `worker/routes/feed.ts` | Hook listen events |
| `worker/index.ts` | Mount recommendation routes |
| `worker/routes/admin/index.ts` | Mount admin recommendation routes |
| `worker/queues/index.ts` | Add weekly profile refresh to cron |
| `src/pages/discover.tsx` | Add "For You" section |
| `worker/lib/topic-extraction.ts` | NEW (Phase 2) — LLM topic tag extraction |
| `worker/queues/distillation.ts` | Hook topic extraction on completion (Phase 2) |
