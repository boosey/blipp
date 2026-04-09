# Podcast Geo-Tagging & Local Discovery

## Problem

Blipp's recommendation engine has no awareness of whether a podcast is geographically focused. A user in Dallas gets the same recommendations as a user in Seattle. The existing sports local boost does keyword title-matching at scoring time, which is fragile and limited to sports. Local news, politics, culture, and community podcasts are invisible to the recommendation engine.

## Solution

Pre-tag podcasts with geographic metadata during a weekly cron job. Use a two-pass system: keyword matching for obvious cases, LLM classification for ambiguous Sports-category podcasts. Store results as `PodcastGeoProfile` records. Surface local content through new Discover page sections and boost geo-relevant podcasts in scoring.

## Data Model

### New model: `PodcastGeoProfile`

```prisma
model PodcastGeoProfile {
  id         String      @id @default(cuid())
  podcastId  String
  dmaCode    String      // Nielsen DMA code this podcast is relevant to
  scope      String      // "city" | "regional" | "state"
  teamId     String?     // Links to SportsTeam if team-specific
  confidence Float       // 0-1 certainty of this tag
  source     String      // "keyword" | "llm"
  createdAt  DateTime    @default(now())

  podcast    Podcast     @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  team       SportsTeam? @relation(fields: [teamId], references: [id])

  @@unique([podcastId, dmaCode, teamId])
  @@index([dmaCode])
  @@index([podcastId])
}
```

A single podcast can have multiple `PodcastGeoProfile` records at different scopes and DMA codes. Example: "Dallas Cowboys Talk" gets city-scope DMA 623 with teamId, plus state-scope for Texas DMAs without teamId.

### Modified models

**Podcast:** Add `geoProcessedAt DateTime?` — null means unprocessed. Set after geo-tagging regardless of whether any profiles were created. Prevents re-processing.

**Podcast:** Add `geoProfiles PodcastGeoProfile[]` relation.

**SportsTeam:** Add `geoProfiles PodcastGeoProfile[]` relation.

**AiStage enum:** Add `geoClassification` value so LLM models can be assigned to this stage in the AI model registry.

## Pipeline: Two-Pass Geo-Tagging

### Trigger

New dedicated cron job `runGeoTaggingJob()` running weekly. Separate from `computePodcastProfiles` because:
- Different lifecycle: geo-tagging processes each podcast once; profiles recompute weekly
- Different failure modes: LLM pass can fail independently
- Independently enable/disable

Query: `WHERE status = 'active' AND geoProcessedAt IS NULL`, batch size 500 per run.

### Pass 1: Keyword Matching

**Lookup tables (hardcoded in code):**
- US cities (top ~300) mapped to Nielsen DMA codes
- US states (all 50) mapped to their DMA code sets
- Regional phrases ("Bay Area", "Pacific Northwest", "Tri-State", "the South") mapped to DMA code sets
- Sports team keywords: loaded from `SportsTeam.keywords` + `SportsTeamMarket.dmaCode` at runtime

**Algorithm per podcast:**
1. Build analysis text: `(title + " " + description).toLowerCase()`
2. Match sports team keywords (highest specificity) → city scope, linked teamId, confidence 0.95
3. Match city names → city scope, confidence 0.9 (title) or 0.7 (description only)
4. Match state names → state scope, confidence 0.6
5. Match regional phrases → regional scope, confidence 0.7
6. Create `PodcastGeoProfile` records for all matches
7. Set `geoProcessedAt = now()`

**Disambiguation:** Ambiguous city names (cities sharing a name, e.g., "Portland" OR/ME, "Springfield" in 30+ states) require one of: (a) a state name also present in the text, (b) the city name appears in the podcast title (not just description), or (c) only one city with that name exists in the top-300 lookup. If none apply, skip — the podcast either gets handled by the LLM pass (if Sports category) or remains untagged (acceptable for non-Sports ambiguous cases).

### Pass 2: LLM Classification

**Triggers for:** Podcasts in the Sports category where Pass 1 found zero matches.

**Model selection:** Configurable via `PlatformConfig` key `geoClassification.llmProviderId`, referencing an `AiModelProvider.id` with `geoClassification` in its model's `stages` array. Uses the standard `callLlm` infrastructure.

**Prompt:**
```
Given this podcast title and description, identify any geographic focus or sports team affiliation.

Title: {title}
Description: {description}

Respond in JSON:
{
  "isLocal": boolean,
  "cities": ["city name"],
  "states": ["state name"],  
  "teams": ["full team name, e.g. Dallas Cowboys"],
  "confidence": 0.0-1.0
}

If no geographic focus: { "isLocal": false, "cities": [], "states": [], "teams": [], "confidence": 0 }
```

**Post-processing:**
1. Parse JSON response
2. Resolve city names → DMA codes via the same lookup table
3. Resolve team names → `SportsTeam.id` via fuzzy match against `SportsTeam.name`
4. Create `PodcastGeoProfile` records with `source: "llm"`
5. Set `geoProcessedAt = now()`

## Cron Job Registration

### New cron: `geoTagging`
- **Config keys:** `cron.geoTagging.enabled` (boolean, default false), `cron.geoTagging.intervalMinutes` (number, default 10080 = weekly)
- **Config key:** `geoClassification.llmProviderId` (string, the AiModelProvider ID to use)
- **Config key:** `geoClassification.batchSize` (number, default 500)
- **Register in:** `worker/index.ts` scheduled handler
- **Implementation:** `worker/lib/cron/geo-tagging.ts`
- **Logs to:** `CronRun` table with jobKey `geoTagging`

### Fix: Register `computePodcastProfiles` cron
If `recommendations` cron is missing from the scheduled handler, register it as well.

## API: Local Discovery Endpoint

### `GET /recommendations/local`

**Auth:** Required (needs user's DMA code)

**Query params:** None (returns both local and local sports)

**Logic:**
1. Get user's `dmaCode` from User record
2. If no DMA code, return empty
3. Query `PodcastGeoProfile` records matching user's DMA code
4. Join with Podcast data (title, imageUrl, author, categories, etc.)
5. Split into two groups:
   - `local`: All results where `teamId IS NULL`
   - `localSports`: All results where `teamId IS NOT NULL`, include team info
6. Sort each group by confidence (desc), then podcast popularity

**Response:**
```json
{
  "data": {
    "local": [{
      "podcast": { "id", "title", "imageUrl", "author", "categories" },
      "scope": "city",
      "confidence": 0.9
    }],
    "localSports": [{
      "podcast": { "id", "title", "imageUrl", "author", "categories" },
      "scope": "city",
      "confidence": 0.95,
      "team": { "id", "name", "nickname", "abbreviation" }
    }],
    "dmaCode": "623"
  }
}
```

## Frontend: Discover Page

### Two new accordion sections

Added to the Discover page, only visible when user has a `dmaCode` and matching content exists:

1. **Local** (MapPin icon) — Non-sports local podcasts (news, culture, politics, community)
2. **Local Sports** (Trophy + MapPin icon) — Team-specific podcasts, optionally grouped by team

Each section shows podcast cards in the existing catalog grid style. Tapping subscribes (same as existing discover flow).

### Data fetching

Call `GET /recommendations/local` on Discover page mount. Conditionally render sections based on whether arrays are non-empty.

## Recommendation Scoring Updates

### Replace keyword title-matching with geo-profile lookup

In `scoreRecommendations()`, the current sports local boost does:
```
if (Sports category && title.includes(teamKeyword)) → additive boost
```

Replace with:
```
if (podcast has PodcastGeoProfile matching user's DMA) → additive boost weighted by confidence
```

This is:
- **Broader:** Boosts all local content, not just sports
- **More accurate:** Pre-computed tags vs. runtime keyword matching
- **Faster:** Single DB query vs. per-podcast string matching

### New config key

`recommendations.weights.localBoost` (number, default 0.10) — replaces `recommendations.weights.sportsLocal`

### Scoring formula

```
localBoost = wLocalBoost * maxConfidence(geoProfiles matching user DMA)
```

Where `maxConfidence` is the highest confidence score among the podcast's geo-profiles that match the user's DMA code. This is additive to the base score (same pattern as the current sports boost).

### Backward compatibility

Remove the old `localTeamKeywords` resolution and title-matching code from `scoreRecommendations`. The geo-profile system fully replaces it.

## Config Keys Summary

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cron.geoTagging.enabled` | boolean | false | Enable geo-tagging cron |
| `cron.geoTagging.intervalMinutes` | number | 10080 | Cron interval (weekly) |
| `geoClassification.llmProviderId` | string | "" | AiModelProvider ID for LLM pass |
| `geoClassification.batchSize` | number | 500 | Podcasts per cron run |
| `recommendations.weights.localBoost` | number | 0.10 | Local content scoring weight |

## Files to Create/Modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add PodcastGeoProfile model, geoProcessedAt on Podcast, geoClassification to AiStage |
| `worker/lib/cron/geo-tagging.ts` | New: geo-tagging cron job implementation |
| `worker/lib/geo-lookup.ts` | New: US city/state/region → DMA code lookup tables |
| `worker/lib/recommendations.ts` | Replace keyword title-matching with geo-profile lookup in scoring |
| `worker/lib/config-registry.ts` | Add config keys |
| `worker/routes/recommendations.ts` | Add GET /recommendations/local endpoint |
| `worker/index.ts` | Register geoTagging cron in scheduled handler |
| `src/pages/discover.tsx` | Add Local and Local Sports accordion sections |
