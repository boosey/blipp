# Listen-to-Original Deeplink Design

**Status:** Design — pending implementation plan
**Date:** 2026-04-29
**Owner:** alex

## Problem

The player's "listen to original" button currently links to `episode.audioUrl`, which opens the raw .mp3 in the browser. This is poor UX for users who want to keep listening to the full episode in their podcast app of choice.

We have Apple Podcasts data on most podcasts (`Podcast.appleId`) and Podcast Index data on others (`Podcast.podcastIndexId`). Apple Podcasts URLs route to the native app on iOS/macOS (Universal Links) and to the web player elsewhere — they're a good universal destination.

## Goals

- Replace the .mp3 link with a podcast-app-friendly destination.
- Land the user on the specific episode in Apple Podcasts when possible; fall back to show-level deeplinks otherwise.
- Disable the button (with tooltip) when no external destination exists.
- Track which destination tier was used so we can measure how often each fallback fires.

## Non-goals

- Per-app preferences ("open in Overcast / Pocket Casts / Spotify"). There is no cross-app default-handler standard on the web; every app uses its own URI scheme that mostly subscribes rather than plays a specific episode.
- Backfill of existing episodes with Apple trackIds.
- Fuzzy matching of RSS episodes to Apple episodes by title/date/duration.
- OS detection or userAgent sniffing.
- A feature flag.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Apple URL is `https://podcasts.apple.com/podcast/...` (not `podcasts://`). | Apple Universal Links route to the native app on iOS/macOS automatically, and the same URL works in any browser. No OS detection needed. |
| 2 | Match Apple episodes to ours only on `episodeGuid === Episode.guid`. | Hard-identifier match only; "no fuzzy matching" per product. |
| 3 | No backfill of existing episodes. | Existing rows resolve to show-level deeplinks automatically. |
| 4 | Apple lookup runs inline in `feed-refresh.ts`, after new-episode upsert and content-prefetch dispatch, best-effort. | One extra HTTP call per Apple-sourced podcast with new episodes, off the pipeline critical path. No new queue. |
| 5 | When no external link exists, button is disabled with a tooltip — not hidden. | Tells the user something exists but is unavailable for this episode. |
| 6 | No fallback to `episode.audioUrl`. | Raw .mp3 link is the UX we're replacing. |

## Fallback chain

The player resolves the destination URL in this order:

1. `Podcast.appleId && Episode.appleEpisodeTrackId` → `https://podcasts.apple.com/podcast/id<appleId>?i=<trackId>` — drops the user into the specific episode.
2. `Podcast.appleId` (no trackId) → `https://podcasts.apple.com/podcast/id<appleId>` — show page, user taps the episode in the list.
3. `Podcast.podcastIndexId` (no Apple data) → `https://podcastindex.org/podcast/<podcastIndexId>` — Podcast Index show page.
4. None of the above → button disabled, tooltip "No external link available for this episode".

## Schema changes

### `Episode.appleEpisodeTrackId String?`

```prisma
model Episode {
  // ...existing fields
  appleEpisodeTrackId String?  // Apple Podcasts trackId, populated when iTunes lookup matched on RSS guid
}
```

No index — only read via `FeedItem` joins, never queried by trackId.

### `ListenOriginalEvent.linkType String?`

```prisma
model ListenOriginalEvent {
  // ...existing fields
  linkType String?  // "apple_episode" | "apple_show" | "podcast_index"
}
```

Both columns are additive and nullable. Migration name: `add_apple_episode_track_id_and_link_type`. Safe under `prisma migrate deploy` — no destructive SQL.

## Components

### Frontend

**`src/lib/external-podcast-link.ts`** (new) — pure resolver:

```ts
export type ExternalLink =
  | { kind: "apple_episode"; url: string }
  | { kind: "apple_show";    url: string }
  | { kind: "podcast_index"; url: string }
  | { kind: "none" };

export function resolveExternalEpisodeLink(input: {
  episode: { appleEpisodeTrackId: string | null };
  podcast: { appleId: string | null; podcastIndexId: string | null };
}): ExternalLink;
```

**`src/components/player-sheet.tsx`** — replace the `<a href={episode.audioUrl}>` block (lines 237–246 of current file) with a derived `externalLink`. When `kind === "none"`, render a disabled `<button>` with `cursor-not-allowed`, muted color, and a `title` attribute. Otherwise render the existing `<a>` shape, pointing at `externalLink.url`. The click handler now takes `linkType: ExternalLink["kind"] & string` and forwards it in the analytics POST.

**`src/types/feed.ts`** — extend `FeedItem.podcast` with `appleId: string | null` and `FeedItem.episode` with `appleEpisodeTrackId: string | null`.

### Backend

**`worker/lib/apple-podcasts.ts`** — add to `ApplePodcastsClient`:

```ts
export interface AppleEpisodeLookupResult {
  trackId: number;
  episodeGuid: string | null;
  trackName: string;
}

async lookupEpisodes(collectionId: string, limit?: number): Promise<AppleEpisodeLookupResult[]>
```

Calls `https://itunes.apple.com/lookup?id=<collectionId>&entity=podcastEpisode&limit=<limit>` (default 300). Reuses `fetchWithRetry`. Filters to `wrapperType === "podcastEpisode"`. On failure, returns `[]` and warns.

**`worker/lib/apple-episode-enrichment.ts`** (new):

```ts
export async function enrichNewEpisodesWithAppleTrackIds(args: {
  prisma: PrismaClient;
  podcast: { id: string; appleId: string | null };
  newEpisodeIds: string[];
  apple: ApplePodcastsClient;
  log: PipelineLogger;
}): Promise<void>
```

1. Bail if `appleId == null` or `newEpisodeIds.length === 0`.
2. Load `{ id, guid }` for each new episode.
3. Call `apple.lookupEpisodes(podcast.appleId)`; build `Map<episodeGuid, trackId>`.
4. For each new episode whose guid matches, run `prisma.episode.update({ data: { appleEpisodeTrackId: String(trackId) } })`.
5. Log `{ action: "apple_episode_enrichment", podcastId, attempted, matched }`.

**`worker/queues/feed-refresh.ts`** — call the helper after the existing prefetch dispatch block, wrapped in `.catch()` so any failure is logged and swallowed:

```ts
if (newEpisodeIds.length > 0 && podcast.appleId) {
  await enrichNewEpisodesWithAppleTrackIds({
    prisma, podcast, newEpisodeIds,
    apple: new ApplePodcastsClient(),
    log,
  }).catch((err) => log.error("apple_enrichment_failed", { podcastId: podcast.id }, err));
}
```

**`worker/routes/feed.ts`** — three `select` clauses (`GET /`, `GET /:id`, `GET /shared/:briefingId`) gain `appleId` on `podcast` and `appleEpisodeTrackId` on `episode`.

**`worker/routes/events.ts`** — Zod schema gains `linkType: z.enum(["apple_episode", "apple_show", "podcast_index"]).optional()`. Create call passes `linkType: body.linkType ?? null`.

## Data flow

### New episode enters the system

1. `feed-refresh` fetches RSS, upserts new episodes (existing flow).
2. New `newEpisodeIds` are sent to content-prefetch (existing flow).
3. **New step:** if `podcast.appleId != null`, `enrichNewEpisodesWithAppleTrackIds` runs:
   - Calls iTunes Lookup once per podcast.
   - Updates each matched episode with `appleEpisodeTrackId`.
   - Logs hit count.
4. `lastFetchedAt` updated (existing flow).

### User clicks "listen to original"

1. PlayerSheet computes `externalLink` from the FeedItem's podcast+episode data.
2. If `kind === "none"`, button is disabled.
3. Otherwise click navigates to `externalLink.url` via `<a target="_blank">` and fires `listen_original_click` with `linkType: externalLink.kind`.
4. `/events/listen-original` writes the row including `linkType`.

## Error handling

- **iTunes Lookup failure:** logged via `apple_enrichment_failed`, swallowed. Affected episodes resolve to show-page on click.
- **`episodeGuid` missing or mismatched:** silent — episode simply has `appleEpisodeTrackId = null` and resolves to show-page.
- **Click-event POST failure:** existing `.catch(() => {})` keeps the navigation working even if analytics is down.

## Testing

| Test | File | Purpose |
|---|---|---|
| Resolver — apple_episode branch | `src/lib/__tests__/external-podcast-link.test.ts` | Both ids present → episode URL |
| Resolver — apple_show branch | same | appleId only → show URL |
| Resolver — podcast_index branch | same | piId only → PI URL |
| Resolver — none branch | same | no ids → kind="none" |
| Resolver — trackId-without-appleId guard | same | Should not produce an episode URL with `idundefined` |
| `lookupEpisodes` happy path | `worker/lib/__tests__/apple-podcasts.test.ts` | Returns trackId/episodeGuid/trackName |
| `lookupEpisodes` retry | same | 429 → success after backoff |
| `lookupEpisodes` malformed | same | Returns `[]` on bad JSON |
| Enrichment — matched guid | `worker/lib/__tests__/apple-episode-enrichment.test.ts` | Calls update with trackId |
| Enrichment — unmatched guid | same | No update call |
| Enrichment — null appleId | same | Returns early, no fetch |
| Feed-refresh integration | `worker/queues/__tests__/feed-refresh.test.ts` | Helper called when appleId+newEpisodes; not called otherwise |
| PlayerSheet — disabled state | `src/__tests__/feed-item.test.tsx` (or sibling) | Renders disabled button when kind="none" |

## Rollout

1. Schema migration applied via `prisma migrate deploy` (CI on merge to staging).
2. Backend ships with the feed payload, events route, and enrichment helper. Old frontend continues to work (it ignores the new fields).
3. Frontend ships with the resolver and disabled-state UI.
4. Within 24h of rollout, query `ListenOriginalEvent` grouped by `linkType` and `apple_episode_enrichment` log lines to confirm match rate is non-zero. If hit rate is dramatically lower than expected, revisit fuzzy matching as a follow-up.

## Open risks

- **Apple `episodeGuid` reliability is unknown.** The actual hit rate of guid-matching on real podcast data is unverifiable until shipped. Acceptable per product decision: graceful degradation to show-page.
- **Capacitor iOS Universal Links.** Need to verify in a native build that `<a target="_blank" href="https://podcasts.apple.com/...">` opens the Apple Podcasts app rather than a browser tab. If not, follow-up may require `@capacitor/browser`. Not pre-solved in this design.

## Out-of-scope follow-ups

- Backfill cron for older episodes if hit rate on new episodes proves the lookup reliable.
- Fuzzy title/date matching as a second pass when `episodeGuid` is missing.
- Per-app deeplinks (Spotify/Overcast/Pocket Casts) if user demand emerges.
