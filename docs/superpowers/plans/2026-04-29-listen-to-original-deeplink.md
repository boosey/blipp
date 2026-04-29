# Listen-to-Original Deeplink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the player's raw `.mp3` external link with a tiered Apple Podcasts / Podcast Index deeplink, dropping users on the specific episode when an Apple `trackId` is known.

**Architecture:** Two new nullable columns (`Episode.appleEpisodeTrackId`, `ListenOriginalEvent.linkType`). A pure frontend resolver picks the destination from available IDs. A new helper enriches new episodes with Apple `trackId` inline in `feed-refresh`, matching only on `episodeGuid === Episode.guid` (no fuzzy matching, no backfill). Disabled-button state when no destination exists.

**Tech Stack:** Prisma 7 + PostgreSQL, Cloudflare Workers + Hono, React 19 + Vite + Tailwind v4, Vitest 4. Existing `ApplePodcastsClient` (`worker/lib/apple-podcasts.ts`) extended with one method.

**Spec:** `docs/superpowers/specs/2026-04-29-listen-to-original-deeplink-design.md`

---

## File map

**Create:**
- `prisma/migrations/<ts>_add_apple_episode_track_id_and_link_type/migration.sql` — additive nullable columns
- `src/lib/external-podcast-link.ts` — pure resolver
- `src/lib/__tests__/external-podcast-link.test.ts` — resolver tests
- `worker/lib/apple-episode-enrichment.ts` — enrichment helper
- `worker/lib/__tests__/apple-episode-enrichment.test.ts` — enrichment tests

**Modify:**
- `prisma/schema.prisma` — add 2 columns
- `worker/lib/apple-podcasts.ts` — add `lookupEpisodes` method + `AppleEpisodeLookupResult` interface
- `worker/lib/__tests__/apple-podcasts.test.ts` — tests for `lookupEpisodes`
- `worker/queues/feed-refresh.ts` — call enrichment after prefetch dispatch
- `worker/queues/__tests__/feed-refresh.test.ts` — verify enrichment is called/skipped
- `worker/routes/feed.ts` — add `appleId` and `appleEpisodeTrackId` to 3 select clauses
- `worker/routes/events.ts` — Zod + create call gain `linkType`
- `worker/routes/__tests__/events.test.ts` if exists, else N/A — verify linkType persists
- `src/types/feed.ts` — extend `FeedItem.podcast` and `FeedItem.episode`
- `src/components/player-sheet.tsx` — replace external-link block with resolver-driven render
- `src/__tests__/feed-item.test.tsx`, `home-feed.test.tsx`, `swipeable-feed-item.test.tsx`, `blipp-feedback-integration.test.tsx` — update mock fixtures with new fields

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_apple_episode_track_id_and_link_type/migration.sql` (auto-generated)

- [ ] **Step 1: Add `appleEpisodeTrackId` to `Episode`**

In `prisma/schema.prisma`, locate `model Episode` (around line 243) and add the new field next to `transcriptUrl`:

```prisma
model Episode {
  id                  String        @id @default(cuid())
  podcastId           String
  title               String
  description         String?
  audioUrl            String
  publishedAt         DateTime?
  durationSeconds     Int?
  guid                String
  transcriptUrl       String?
  appleEpisodeTrackId String?       // Apple Podcasts trackId from iTunes Lookup; populated when episodeGuid matches
  contentStatus       ContentStatus @default(PENDING)
  // ...rest unchanged
}
```

- [ ] **Step 2: Add `linkType` to `ListenOriginalEvent`**

In `prisma/schema.prisma`, locate `model ListenOriginalEvent` (around line 1234) and add the new field next to `referralSource`:

```prisma
model ListenOriginalEvent {
  // ...existing fields above...
  referralSource     ReferralSource
  linkType           String?                  // "apple_episode" | "apple_show" | "podcast_index"
  timeToClickSec     Float
  // ...rest unchanged
}
```

- [ ] **Step 3: Generate the migration**

Run:
```bash
npm run db:migrate:new add_apple_episode_track_id_and_link_type
```

Expected output: a new directory `prisma/migrations/<timestamp>_add_apple_episode_track_id_and_link_type/` with `migration.sql` containing two `ALTER TABLE ... ADD COLUMN` statements (both nullable).

- [ ] **Step 4: Verify the migration is purely additive**

Open the generated `migration.sql`. It should contain only `ALTER TABLE "Episode" ADD COLUMN "appleEpisodeTrackId" TEXT;` and `ALTER TABLE "ListenOriginalEvent" ADD COLUMN "linkType" TEXT;` (or equivalent). No drops, no NOT NULL on existing rows.

- [ ] **Step 5: Regenerate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: regenerates `src/generated/prisma/`. If `src/generated/prisma/index.ts` doesn't exist, create it as a barrel export per the CLAUDE.md note ("Prisma generate: Must manually create `src/generated/prisma/index.ts` barrel export"). If it already exists, leave it.

- [ ] **Step 6: Typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS (the new fields are unused so far, but the schema must compile).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Episode.appleEpisodeTrackId + ListenOriginalEvent.linkType"
```

---

## Task 2: Pure link resolver

**Files:**
- Create: `src/lib/external-podcast-link.ts`
- Test: `src/lib/__tests__/external-podcast-link.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/external-podcast-link.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveExternalEpisodeLink } from "../external-podcast-link";

describe("resolveExternalEpisodeLink", () => {
  it("returns apple_episode URL when both appleId and trackId are present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: "1000123" },
      podcast: { appleId: "456", podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "apple_episode",
      url: "https://podcasts.apple.com/podcast/id456?i=1000123",
    });
  });

  it("returns apple_show URL when only appleId is present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: "456", podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "apple_show",
      url: "https://podcasts.apple.com/podcast/id456",
    });
  });

  it("returns podcast_index URL when only podcastIndexId is present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: null, podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "podcast_index",
      url: "https://podcastindex.org/podcast/789",
    });
  });

  it("returns kind='none' when no IDs are present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: null, podcastIndexId: null },
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("does not produce an episode URL with undefined appleId when trackId is set without appleId", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: "1000123" },
      podcast: { appleId: null, podcastIndexId: "789" },
    });
    expect(result.kind).not.toBe("apple_episode");
    expect(result.kind).toBe("podcast_index");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/lib/__tests__/external-podcast-link.test.ts
```

Expected: FAIL with "Cannot find module '../external-podcast-link'".

- [ ] **Step 3: Implement the resolver**

Create `src/lib/external-podcast-link.ts`:

```ts
export type ExternalLink =
  | { kind: "apple_episode"; url: string }
  | { kind: "apple_show"; url: string }
  | { kind: "podcast_index"; url: string }
  | { kind: "none" };

export function resolveExternalEpisodeLink(input: {
  episode: { appleEpisodeTrackId: string | null };
  podcast: { appleId: string | null; podcastIndexId: string | null };
}): ExternalLink {
  const { episode, podcast } = input;
  if (podcast.appleId && episode.appleEpisodeTrackId) {
    return {
      kind: "apple_episode",
      url: `https://podcasts.apple.com/podcast/id${podcast.appleId}?i=${episode.appleEpisodeTrackId}`,
    };
  }
  if (podcast.appleId) {
    return {
      kind: "apple_show",
      url: `https://podcasts.apple.com/podcast/id${podcast.appleId}`,
    };
  }
  if (podcast.podcastIndexId) {
    return {
      kind: "podcast_index",
      url: `https://podcastindex.org/podcast/${podcast.podcastIndexId}`,
    };
  }
  return { kind: "none" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/lib/__tests__/external-podcast-link.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/external-podcast-link.ts src/lib/__tests__/external-podcast-link.test.ts
git commit -m "feat(player): pure resolver for external episode link"
```

---

## Task 3: Apple `lookupEpisodes` API method

**Files:**
- Modify: `worker/lib/apple-podcasts.ts`
- Test: `worker/lib/__tests__/apple-podcasts.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `worker/lib/__tests__/apple-podcasts.test.ts` (inside the existing `describe("Apple Podcasts Client", () => { ... })` block):

```ts
  describe("lookupEpisodes", () => {
    it("returns trackId, episodeGuid, and trackName for each podcastEpisode entry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          resultCount: 3,
          results: [
            { wrapperType: "track", kind: "podcast", collectionId: 999 }, // The show entry — filtered out
            { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 100, trackName: "Ep 1", episodeGuid: "guid-1" },
            { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 101, trackName: "Ep 2", episodeGuid: null },
          ],
        }),
      });

      const promise = client.lookupEpisodes("999");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ trackId: 100, episodeGuid: "guid-1", trackName: "Ep 1" });
      expect(result[1]).toEqual({ trackId: 101, episodeGuid: null, trackName: "Ep 2" });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("/lookup?id=999&entity=podcastEpisode");
      expect(url).toContain("limit=300");
    });

    it("respects custom limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ resultCount: 0, results: [] }),
      });

      const promise = client.lookupEpisodes("999", 50);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch.mock.calls[0][0]).toContain("limit=50");
    });

    it("returns empty array on non-retryable failure", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

      const promise = client.lookupEpisodes("999");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([]);
    });

    it("returns empty array when episodeGuid field is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          resultCount: 1,
          results: [
            { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 100, trackName: "Ep 1" },
          ],
        }),
      });

      const promise = client.lookupEpisodes("999");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([{ trackId: 100, episodeGuid: null, trackName: "Ep 1" }]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/lib/__tests__/apple-podcasts.test.ts
```

Expected: FAIL — `client.lookupEpisodes is not a function`.

- [ ] **Step 3: Implement the method**

In `worker/lib/apple-podcasts.ts`, add the new exported interface near the existing `AppleLookupResult` interface (around line 107):

```ts
/** A podcast-episode entry from the iTunes Lookup API */
export interface AppleEpisodeLookupResult {
  trackId: number;
  episodeGuid: string | null;
  trackName: string;
}
```

Then add the method to `ApplePodcastsClient` (after the existing `search` method, before the closing brace):

```ts
  /**
   * Looks up episodes for a podcast by Apple collection ID.
   *
   * @param collectionId - Apple podcast collection ID (Podcast.appleId)
   * @param limit - Max episodes to return (default 300, Apple typically caps around 300)
   * @returns Array of episode entries, or empty array on failure
   */
  async lookupEpisodes(
    collectionId: string,
    limit: number = 300
  ): Promise<AppleEpisodeLookupResult[]> {
    const url = `${ITUNES_BASE}/lookup?id=${collectionId}&entity=podcastEpisode&limit=${limit}`;
    try {
      const res = await fetchWithRetry(url);
      const data = (await res.json()) as { resultCount: number; results: any[] };
      return (data.results ?? [])
        .filter((r) => r.wrapperType === "podcastEpisode")
        .map((r) => ({
          trackId: r.trackId,
          episodeGuid: r.episodeGuid ?? null,
          trackName: r.trackName ?? "",
        }));
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "apple_lookup_episodes_failed",
        collectionId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
      return [];
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/lib/__tests__/apple-podcasts.test.ts
```

Expected: PASS — all `lookupEpisodes` tests green; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/apple-podcasts.ts worker/lib/__tests__/apple-podcasts.test.ts
git commit -m "feat(apple): add lookupEpisodes for trackId resolution"
```

---

## Task 4: Apple episode enrichment helper

**Files:**
- Create: `worker/lib/apple-episode-enrichment.ts`
- Test: `worker/lib/__tests__/apple-episode-enrichment.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `worker/lib/__tests__/apple-episode-enrichment.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import { enrichNewEpisodesWithAppleTrackIds } from "../apple-episode-enrichment";
import { ApplePodcastsClient } from "../apple-podcasts";

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
};

describe("enrichNewEpisodesWithAppleTrackIds", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let lookupSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    lookupSpy = vi.spyOn(ApplePodcastsClient.prototype, "lookupEpisodes");
  });

  it("updates episodes whose RSS guid matches an Apple episodeGuid", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([
      { id: "ep-1", guid: "rss-guid-1" },
      { id: "ep-2", guid: "rss-guid-2" },
    ]);
    lookupSpy.mockResolvedValue([
      { trackId: 1001, episodeGuid: "rss-guid-1", trackName: "Ep 1" },
      { trackId: 1002, episodeGuid: "rss-guid-other", trackName: "Other" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1", "ep-2"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).toHaveBeenCalledWith("999");
    expect(mockPrisma.episode.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.episode.update).toHaveBeenCalledWith({
      where: { id: "ep-1" },
      data: { appleEpisodeTrackId: "1001" },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      "apple_episode_enrichment",
      expect.objectContaining({ podcastId: "pod-1", attempted: 2, matched: 1 })
    );
  });

  it("makes no update calls when no guids match", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([{ id: "ep-1", guid: "rss-guid-1" }]);
    lookupSpy.mockResolvedValue([
      { trackId: 1002, episodeGuid: "rss-guid-other", trackName: "Other" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "apple_episode_enrichment",
      expect.objectContaining({ matched: 0 })
    );
  });

  it("bails immediately when appleId is null", async () => {
    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: null },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).not.toHaveBeenCalled();
    expect(mockPrisma.episode.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
  });

  it("bails immediately when newEpisodeIds is empty", async () => {
    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: [],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it("ignores Apple results with null episodeGuid", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([{ id: "ep-1", guid: "rss-guid-1" }]);
    lookupSpy.mockResolvedValue([
      { trackId: 1001, episodeGuid: null, trackName: "Ep 1" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/lib/__tests__/apple-episode-enrichment.test.ts
```

Expected: FAIL with "Cannot find module '../apple-episode-enrichment'".

- [ ] **Step 3: Implement the helper**

Create `worker/lib/apple-episode-enrichment.ts`:

```ts
import type { PrismaClient } from "./db";
import type { PipelineLogger } from "./logger";
import type { ApplePodcastsClient } from "./apple-podcasts";

/**
 * Best-effort enrichment: for each new episode, if Apple's iTunes Lookup
 * returns an entry whose `episodeGuid` matches the RSS GUID, store the
 * Apple `trackId` on the Episode row so the player can deeplink to it.
 *
 * Hard match only — no fuzzy matching, no fallback to title/date/duration.
 * Failure is silent (logged); episodes simply remain without a trackId
 * and the player resolves to the show-level Apple URL.
 */
export async function enrichNewEpisodesWithAppleTrackIds(args: {
  prisma: PrismaClient;
  podcast: { id: string; appleId: string | null };
  newEpisodeIds: string[];
  apple: ApplePodcastsClient;
  log: PipelineLogger;
}): Promise<void> {
  const { prisma, podcast, newEpisodeIds, apple, log } = args;

  if (!podcast.appleId || newEpisodeIds.length === 0) return;

  const newEpisodes = await prisma.episode.findMany({
    where: { id: { in: newEpisodeIds } },
    select: { id: true, guid: true },
  });

  const appleEntries = await apple.lookupEpisodes(podcast.appleId);

  // Build map only from entries with a non-null episodeGuid
  const guidToTrackId = new Map<string, number>();
  for (const entry of appleEntries) {
    if (entry.episodeGuid) guidToTrackId.set(entry.episodeGuid, entry.trackId);
  }

  let matched = 0;
  for (const ep of newEpisodes) {
    const trackId = guidToTrackId.get(ep.guid);
    if (trackId == null) continue;
    await prisma.episode.update({
      where: { id: ep.id },
      data: { appleEpisodeTrackId: String(trackId) },
    });
    matched++;
  }

  log.info("apple_episode_enrichment", {
    podcastId: podcast.id,
    attempted: newEpisodes.length,
    matched,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/lib/__tests__/apple-episode-enrichment.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/apple-episode-enrichment.ts worker/lib/__tests__/apple-episode-enrichment.test.ts
git commit -m "feat(pipeline): add Apple episode enrichment helper"
```

---

## Task 5: Wire enrichment into feed-refresh

**Files:**
- Modify: `worker/queues/feed-refresh.ts`
- Test: `worker/queues/__tests__/feed-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Append two tests inside the existing `describe("handleFeedRefresh", () => { ... })` block in `worker/queues/__tests__/feed-refresh.test.ts`. First add a top-level mock for the enrichment module (place this with the other `vi.mock` calls near the top of the file, after the rss-parser mock):

```ts
vi.mock("../../lib/apple-episode-enrichment", () => ({
  enrichNewEpisodesWithAppleTrackIds: vi.fn().mockResolvedValue(undefined),
}));
```

Add the import at the bottom of the existing imports:

```ts
import { enrichNewEpisodesWithAppleTrackIds } from "../../lib/apple-episode-enrichment";
```

Then add tests:

```ts
  it("calls Apple enrichment when podcast has appleId and there are new episodes", async () => {
    const podcast = {
      id: "pod-1",
      feedUrl: "https://example.com/feed.xml",
      title: "Test",
      slug: "test",
      appleId: "999",
    };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
    // No existing GUIDs — episode is new
    mockPrisma.episode.findMany.mockResolvedValue([]);
    mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-new", podcastId: "pod-1", guid: "guid-1" });
    mockPrisma.podcast.update.mockResolvedValue(podcast);
    // catalog-pregen disabled to skip that path
    mockPrisma.cronJob.findUnique.mockResolvedValue({ enabled: false });

    const mockMsg = { body: { type: "manual", podcastId: "pod-1" }, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = { messages: [mockMsg], queue: "feed-refresh" } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    expect(enrichNewEpisodesWithAppleTrackIds).toHaveBeenCalledWith(
      expect.objectContaining({
        podcast: expect.objectContaining({ id: "pod-1", appleId: "999" }),
        newEpisodeIds: ["ep-new"],
      })
    );
  });

  it("does not call Apple enrichment when podcast has no appleId", async () => {
    const podcast = {
      id: "pod-1",
      feedUrl: "https://example.com/feed.xml",
      title: "Test",
      slug: "test",
      appleId: null,
    };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
    mockPrisma.episode.findMany.mockResolvedValue([]);
    mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-new", podcastId: "pod-1", guid: "guid-1" });
    mockPrisma.podcast.update.mockResolvedValue(podcast);
    mockPrisma.cronJob.findUnique.mockResolvedValue({ enabled: false });

    const mockMsg = { body: { type: "manual", podcastId: "pod-1" }, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = { messages: [mockMsg], queue: "feed-refresh" } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    expect(enrichNewEpisodesWithAppleTrackIds).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/queues/__tests__/feed-refresh.test.ts
```

Expected: FAIL — `enrichNewEpisodesWithAppleTrackIds` mock was not called (the production code doesn't call it yet).

- [ ] **Step 3: Wire the call into `feed-refresh.ts`**

In `worker/queues/feed-refresh.ts`, add the import at the top with the other lib imports:

```ts
import { ApplePodcastsClient } from "../lib/apple-podcasts";
import { enrichNewEpisodesWithAppleTrackIds } from "../lib/apple-episode-enrichment";
```

Then in `processPodcast`, after the `// Queue content prefetch for new episodes` block (around line 268, immediately after the `env.CONTENT_PREFETCH_QUEUE.sendBatch(...)` call), add:

```ts
  // Best-effort: enrich new episodes with Apple Podcasts trackId so the
  // player's "listen to original" button can deep-link straight to the episode.
  // Failure is logged and swallowed — feed refresh must not depend on iTunes API.
  if (newEpisodeIds.length > 0 && podcast.appleId) {
    await enrichNewEpisodesWithAppleTrackIds({
      prisma,
      podcast: { id: podcast.id, appleId: podcast.appleId },
      newEpisodeIds,
      apple: new ApplePodcastsClient(),
      log,
    }).catch((err) => {
      log.error("apple_enrichment_failed", { podcastId: podcast.id }, err);
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/queues/__tests__/feed-refresh.test.ts
```

Expected: PASS — both new tests green; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add worker/queues/feed-refresh.ts worker/queues/__tests__/feed-refresh.test.ts
git commit -m "feat(pipeline): enrich new episodes with Apple trackId in feed-refresh"
```

---

## Task 6: Expose new fields in feed payload

**Files:**
- Modify: `worker/routes/feed.ts`
- Modify: `src/types/feed.ts`

- [ ] **Step 1: Update the TypeScript type**

In `src/types/feed.ts`, extend `FeedItem.podcast` and `FeedItem.episode`:

```ts
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
    podcastIndexId: string | null;
    appleId: string | null;
  };
  episode: {
    id: string;
    title: string;
    publishedAt: string;
    durationSeconds: number | null;
    audioUrl: string;
    appleEpisodeTrackId: string | null;
  };
```

- [ ] **Step 2: Update the three `select` clauses in `worker/routes/feed.ts`**

There are three `select` clauses — in `GET /` (around line 78–79), in `GET /shared/:briefingId` (around lines 170–171 and 224–225), and in `GET /:id` (around lines 268–269). For each, add `appleId: true` to the podcast select and `appleEpisodeTrackId: true` to the episode select. Example replacement (apply to all three sites):

```ts
        podcast: { select: { id: true, title: true, imageUrl: true, podcastIndexId: true, appleId: true } },
        episode: { select: { id: true, title: true, publishedAt: true, durationSeconds: true, audioUrl: true, appleEpisodeTrackId: true } },
```

- [ ] **Step 3: Typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS. If it fails because the Prisma client wasn't regenerated, run `npx prisma generate` and retry.

- [ ] **Step 4: Commit**

```bash
git add worker/routes/feed.ts src/types/feed.ts
git commit -m "feat(feed): expose appleId + appleEpisodeTrackId in feed payload"
```

---

## Task 7: Accept `linkType` on the listen-original event

**Files:**
- Modify: `worker/routes/events.ts`

- [ ] **Step 1: Extend the Zod schema and create call**

In `worker/routes/events.ts`, modify the `listenOriginalSchema` (around line 10) to add `linkType` after `referralSource`:

```ts
const listenOriginalSchema = z.object({
  eventType: z.enum([
    "listen_original_click",
    "listen_original_start",
    "listen_original_complete",
  ]),
  sessionId: z.string().min(1),
  deviceType: z.enum(["mobile", "desktop", "tablet"]),
  platform: z.enum(["ios", "android", "web"]),
  blippId: z.string().min(1),
  blippDurationMs: z.number().int().min(0),
  episodeId: z.string().min(1),
  podcastId: z.string().min(1),
  publisherId: z.string().min(1),
  referralSource: z.enum(["feed", "search", "share", "notification"]),
  linkType: z.enum(["apple_episode", "apple_show", "podcast_index"]).optional(),
  timeToClickSec: z.number().min(0),
  blippCompletionPct: z.number().min(0).max(1),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});
```

In the `prisma.listenOriginalEvent.create({ data: { ... } })` call (around line 52), add `linkType: body.linkType ?? null,` after `referralSource: body.referralSource,`:

```ts
      referralSource: body.referralSource,
      linkType: body.linkType ?? null,
      timeToClickSec: body.timeToClickSec,
```

- [ ] **Step 2: Typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add worker/routes/events.ts
git commit -m "feat(events): accept linkType on listen-original click event"
```

---

## Task 8: Update PlayerSheet — disabled state + linkType analytics

**Files:**
- Modify: `src/components/player-sheet.tsx`

- [ ] **Step 1: Replace the external-link block**

In `src/components/player-sheet.tsx`, add the import at the top with the other lib imports:

```ts
import { resolveExternalEpisodeLink } from "../lib/external-podcast-link";
```

Update the `handleListenOriginal` callback (currently at lines 91–124) to take a `linkType` argument and forward it in the POST body. Replace its signature and the `apiFetch` call:

```ts
  const handleListenOriginal = useCallback((linkType: "apple_episode" | "apple_show" | "podcast_index") => {
    if (!currentItem) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isTablet = /iPad|Android(?!.*Mobile)/.test(ua);
    const isMobile = /iPhone|iPod|Android.*Mobile/.test(ua);
    const deviceType: "mobile" | "tablet" | "desktop" =
      isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
    const referralSource: "feed" | "search" | "share" | "notification" =
      currentItem.source === "SHARED" ? "share" : "feed";
    const briefingId = currentItem.briefing?.id ?? currentItem.id;
    const briefingDurationSec =
      currentItem.briefing?.clip?.actualSeconds ?? (duration > 0 ? duration : 0);
    const completionPct = duration > 0
      ? Math.min(1, Math.max(0, currentTime / duration))
      : 0;

    apiFetch("/events/listen-original", {
      method: "POST",
      body: JSON.stringify({
        eventType: "listen_original_click",
        sessionId: crypto.randomUUID(),
        deviceType,
        platform: "web",
        blippId: briefingId,
        blippDurationMs: Math.round(briefingDurationSec * 1000),
        episodeId: currentItem.episode.id,
        podcastId: currentItem.podcast.id,
        publisherId: currentItem.podcast.id,
        referralSource,
        linkType,
        timeToClickSec: Math.max(0, currentTime),
        blippCompletionPct: completionPct,
      }),
    }).catch(() => {});
  }, [currentItem, currentTime, duration, apiFetch]);
```

Then replace the `<a>` block at lines 237–246 (inside the "Right actions" `<div>`) with the resolver-driven block:

```tsx
            {(() => {
              const externalLink = resolveExternalEpisodeLink({
                episode: { appleEpisodeTrackId: currentItem.episode.appleEpisodeTrackId },
                podcast: {
                  appleId: currentItem.podcast.appleId,
                  podcastIndexId: currentItem.podcast.podcastIndexId,
                },
              });
              if (externalLink.kind === "none") {
                return (
                  <button
                    type="button"
                    disabled
                    className="p-2 rounded-full text-muted-foreground/40 cursor-not-allowed"
                    aria-label="No external link available for this episode"
                    title="No external link available for this episode"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                );
              }
              return (
                <a
                  href={externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleListenOriginal(externalLink.kind)}
                  className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Listen to original episode"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              );
            })()}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS — the `FeedItem` type updated in Task 6 already exposes the new fields.

- [ ] **Step 3: Commit**

```bash
git add src/components/player-sheet.tsx
git commit -m "feat(player): tiered Apple/PodcastIndex deeplink with disabled state"
```

---

## Task 9: Update PlayerSheet test fixtures

**Files:**
- Modify: `src/__tests__/feed-item.test.tsx`
- Modify: `src/__tests__/home-feed.test.tsx`
- Modify: `src/__tests__/swipeable-feed-item.test.tsx`
- Modify: `src/__tests__/blipp-feedback-integration.test.tsx`

- [ ] **Step 1: Run the existing tests to see what's failing**

Run:
```bash
npx vitest run src/__tests__/feed-item.test.tsx src/__tests__/home-feed.test.tsx src/__tests__/swipeable-feed-item.test.tsx src/__tests__/blipp-feedback-integration.test.tsx
```

Expected: tests may pass (the new fields are nullable, so existing fixtures still satisfy the type at runtime), but TypeScript will complain in step 2.

- [ ] **Step 2: Add the two new fields to every `FeedItem`-shaped fixture in those four files**

For each fixture object that constructs a `FeedItem`-like value (search for `podcastIndexId:` to find them), add the two new fields. For each podcast block:

```ts
podcast: {
  id: "...",
  title: "...",
  imageUrl: ...,
  podcastIndexId: ...,
  appleId: null,        // <-- add this
},
```

For each episode block:

```ts
episode: {
  id: "...",
  title: "...",
  publishedAt: "...",
  durationSeconds: ...,
  audioUrl: "...",
  appleEpisodeTrackId: null,   // <-- add this
},
```

(All four test files already contain `podcastIndexId` per the earlier grep — those are the call sites.)

- [ ] **Step 3: Run tests to verify they pass**

Run:
```bash
npx vitest run src/__tests__/feed-item.test.tsx src/__tests__/home-feed.test.tsx src/__tests__/swipeable-feed-item.test.tsx src/__tests__/blipp-feedback-integration.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/
git commit -m "test(feed): add new podcast/episode fields to fixtures"
```

---

## Task 10: PlayerSheet — disabled-state render test

**Files:**
- Create: `src/components/__tests__/player-sheet.test.tsx` (only if no test file already covers PlayerSheet rendering — check first; if `src/__tests__/feed-item.test.tsx` already mounts PlayerSheet via the audio context, add a test there instead)

- [ ] **Step 1: Check for existing PlayerSheet test coverage**

Run:
```bash
npx grep -l "PlayerSheet" src/__tests__ src/components/__tests__ 2>/dev/null
```

If no file exists that imports `PlayerSheet`, create the new test file in step 2. Otherwise, append the test in step 2 to the existing file.

- [ ] **Step 2: Write the test**

The minimal test asserts that when both `appleId` and `podcastIndexId` are null on the current playing item, the disabled button is rendered (with the `disabled` attribute and the right `aria-label`). PlayerSheet depends on `useAudio`, `usePodcastSheet`, `usePlan`, and `useApiFetch` contexts — mock them. If you're appending to an existing test file, reuse its existing context mocks; otherwise the new file looks like:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerSheet } from "../player-sheet";

vi.mock("../../contexts/audio-context", () => ({
  useAudio: () => ({
    currentItem: {
      id: "fi-1",
      source: "SUBSCRIPTION",
      podcast: { id: "p1", title: "Test", imageUrl: null, podcastIndexId: null, appleId: null },
      episode: { id: "e1", title: "Ep", publishedAt: "", durationSeconds: 0, audioUrl: "https://x/a.mp3", appleEpisodeTrackId: null },
      briefing: null,
    },
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    queue: [],
  }),
}));

vi.mock("../../contexts/podcast-sheet-context", () => ({
  usePodcastSheet: () => ({ open: vi.fn() }),
}));

vi.mock("../../contexts/plan-context", () => ({
  usePlan: () => ({ publicSharing: false }),
}));

vi.mock("../../lib/api-client", () => ({
  useApiFetch: () => vi.fn(),
}));

describe("PlayerSheet — external link", () => {
  it("renders a disabled button when no appleId and no podcastIndexId", () => {
    render(<PlayerSheet open={true} onOpenChange={vi.fn()} />);
    const btn = screen.getByLabelText("No external link available for this episode");
    expect(btn).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run:
```bash
npx vitest run <path-to-test-file>
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add <path-to-test-file>
git commit -m "test(player): assert disabled external-link button when no IDs"
```

---

## Task 11: Final verification

**Files:** none modified — verification only

- [ ] **Step 1: Full typecheck**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Full test suite (worker)**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/
```

Expected: PASS, with the new `lookupEpisodes`, `apple-episode-enrichment`, and feed-refresh tests included.

- [ ] **Step 3: Full test suite (frontend)**

Run:
```bash
npx vitest run src/
```

Expected: PASS.

- [ ] **Step 4: Migration status check (staging)**

Run (only if you have staging DB credentials configured):
```bash
npm run db:migrate:status:staging
```

Expected: the new migration is listed as pending. CI will apply it on merge per the CLAUDE.md "Schema deploys" note.

- [ ] **Step 5: Manual smoke test plan (post-deploy)**

After staging deploy completes:
1. Open the player on a feed item whose podcast has `appleId` set and inspect the rendered link — should be `https://podcasts.apple.com/podcast/id<appleId>` (show page).
2. Wait for `feed-refresh` to run (or trigger manually) on a podcast with new episodes; check Workers Logs for `apple_episode_enrichment` lines and confirm `matched > 0` for at least one podcast.
3. Open the player on a newly-enriched episode and confirm the link is the per-episode form (`?i=<trackId>`).
4. Open the player on a feed item where the podcast has neither Apple nor PI data and confirm the button is rendered as disabled with the tooltip text.
5. Click the link from a desktop browser → confirms it opens `podcasts.apple.com`. Click from iOS Capacitor app → confirms it opens the Apple Podcasts native app via Universal Links. (If the native app does not open, file a follow-up to add `@capacitor/browser` integration.)

---

## Self-review

**Spec coverage:**
- ✅ §Schema (Episode.appleEpisodeTrackId + ListenOriginalEvent.linkType) → Task 1
- ✅ §Components — frontend resolver → Task 2
- ✅ §Components — Apple lookupEpisodes → Task 3
- ✅ §Components — apple-episode-enrichment.ts → Task 4
- ✅ §Components — feed-refresh wiring → Task 5
- ✅ §Components — feed payload + types → Task 6
- ✅ §Components — events route Zod + create → Task 7
- ✅ §Components — PlayerSheet rewrite → Task 8
- ✅ §Testing — pure resolver / lookup / enrichment / feed-refresh integration / PlayerSheet → Tasks 2, 3, 4, 5, 9, 10
- ✅ §Rollout — migration + observability → Task 1, Task 11

**Placeholder scan:** no TBDs, no "implement later", no "similar to Task N", no test stubs without code.

**Type consistency:** `ExternalLink` discriminated union defined in Task 2 is reused identically in Task 8 (`linkType: "apple_episode" | "apple_show" | "podcast_index"`). `AppleEpisodeLookupResult` defined in Task 3 is consumed in Task 4. `enrichNewEpisodesWithAppleTrackIds` signature in Task 4 matches the call site in Task 5. All field names (`appleEpisodeTrackId`, `appleId`, `podcastIndexId`, `linkType`) are spelled identically across schema, types, route selects, resolver, helper, test fixtures, and player.
