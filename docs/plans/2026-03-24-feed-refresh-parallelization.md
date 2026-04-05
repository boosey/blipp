# Feed Refresh Parallelization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parallelize RSS feed fetching within each queue consumer invocation, add fetch timeouts, and make batch size / timeout configurable via PlatformConfig.

**Architecture:** Instead of sending one podcast per queue message, producers chunk podcast IDs into groups (controlled by `pipeline.feedRefresh.batchConcurrency` config). The consumer unpacks the chunk and processes all podcasts in parallel via `Promise.allSettled`, each with an `AbortController` timeout (controlled by `pipeline.feedRefresh.fetchTimeoutMs`). A shared helper function handles the chunking logic for all producers. Wrangler `max_concurrency` is bumped to 50.

**Tech Stack:** Cloudflare Workers, Cloudflare Queues, Prisma, Hono, PlatformConfig, React admin UI

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `worker/lib/constants.ts` | Modify | Add `FEED_REFRESH_MAX_CONSUMERS` constant |
| `worker/lib/queue-messages.ts` | Modify | Add `podcastIds` field to `FeedRefreshMessage` |
| `worker/lib/queue-helpers.ts` | Modify | Add `sendBatchedFeedRefresh()` helper |
| `worker/queues/feed-refresh.ts` | Modify | Parallel processing + fetch timeout |
| `worker/routes/admin/episode-refresh.ts` | Modify | Use batched helper for POST / and POST /:id/resume |
| `worker/lib/cron/pipeline-trigger.ts` | Modify | Use batched helper |
| `worker/routes/admin/pipeline.ts` | Modify | Use batched helper for multi-podcast path |
| `worker/routes/admin/catalog-seed.ts` | Modify | Use batched helper |
| `worker/routes/admin/clean-r2.ts` | Modify | Use batched helper |
| `worker/queues/catalog-refresh.ts` | Modify | Use batched helper |
| `src/pages/admin/podcast-settings.tsx` | Modify | Add 2 new config entries + read-only max consumers display |
| `wrangler.jsonc` | Modify | Bump `max_concurrency` to 50 (staging + production) |
| `docs/pipeline.md` | Modify | Document new config keys |
| `docs/architecture.md` | Modify | Document new config keys |
| `worker/queues/__tests__/feed-refresh.test.ts` | Modify | Update tests for new message format + parallel processing |
| `worker/routes/admin/__tests__/pipeline-triggers.test.ts` | Modify | Update assertions for `sendBatch` vs `send` |
| `worker/routes/podcasts.ts` | No change | Uses `podcastId` singular — backward compatible |
| `worker/routes/admin/podcasts.ts` | No change | Uses `podcastId` singular — backward compatible |

---

### Task 1: Update message types and constants

**Files:**
- Modify: `worker/lib/queue-messages.ts:68-73`
- Modify: `worker/lib/constants.ts:30` (append)

- [ ] **Step 1: Add `podcastIds` to `FeedRefreshMessage`**

In `worker/lib/queue-messages.ts`, update the interface:

```typescript
/** Feed refresh queue. */
export interface FeedRefreshMessage {
  podcastId?: string;
  podcastIds?: string[];
  type?: "manual" | "cron";
  refreshJobId?: string;
}
```

- [ ] **Step 2: Add `FEED_REFRESH_MAX_CONSUMERS` constant**

Append to `worker/lib/constants.ts`:

```typescript
/**
 * Max concurrent feed-refresh queue consumers (mirrors wrangler.jsonc max_concurrency).
 * Displayed read-only in admin UI. Change requires redeploy.
 */
export const FEED_REFRESH_MAX_CONSUMERS = 50;
```

- [ ] **Step 3: Commit**

```bash
git add worker/lib/queue-messages.ts worker/lib/constants.ts
git commit -m "feat: add podcastIds to FeedRefreshMessage + max consumers constant"
```

---

### Task 2: Add batched send helper

**Files:**
- Modify: `worker/lib/queue-helpers.ts:58` (append)

- [ ] **Step 1: Add `sendBatchedFeedRefresh` to queue-helpers.ts**

Append to `worker/lib/queue-helpers.ts`:

```typescript
import type { FeedRefreshMessage } from "./queue-messages";

/**
 * Chunks podcast IDs by batchConcurrency and sends one queue message per chunk.
 * Each message body contains `podcastIds: string[]`.
 * CF sendBatch limit is 100 messages per call.
 */
export async function sendBatchedFeedRefresh(
  queue: { sendBatch(messages: { body: FeedRefreshMessage }[]): Promise<void> },
  podcastIds: string[],
  batchConcurrency: number,
  extra?: Omit<FeedRefreshMessage, "podcastId" | "podcastIds">
): Promise<void> {
  if (podcastIds.length === 0) return;

  const messages: { body: FeedRefreshMessage }[] = [];
  for (let i = 0; i < podcastIds.length; i += batchConcurrency) {
    const chunk = podcastIds.slice(i, i + batchConcurrency);
    messages.push({
      body: { podcastIds: chunk, ...extra },
    });
  }

  const CF_SEND_BATCH_LIMIT = 100;
  for (let i = 0; i < messages.length; i += CF_SEND_BATCH_LIMIT) {
    await queue.sendBatch(messages.slice(i, i + CF_SEND_BATCH_LIMIT));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/queue-helpers.ts
git commit -m "feat: add sendBatchedFeedRefresh helper for chunked queue dispatch"
```

---

### Task 3: Refactor feed-refresh consumer for parallel processing

**Files:**
- Modify: `worker/queues/feed-refresh.ts` (major refactor)
- Test: `worker/queues/__tests__/feed-refresh.test.ts`

- [ ] **Step 1: Refactor the consumer**

Rewrite `worker/queues/feed-refresh.ts`. Key changes:
- Collect podcast IDs from both `podcastId` (singular, backward compat) and `podcastIds` (plural, new batched format)
- Read `pipeline.feedRefresh.fetchTimeoutMs` config (default `10000`)
- Process all podcasts in parallel via `Promise.allSettled`
- Each podcast gets its own `AbortController` with configurable timeout
- Log `feed_fetch_timeout` on timeout with podcastId, title, feedUrl
- Record timeout as error on refresh job

```typescript
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { parseRssFeed, type ParsedEpisode } from "../lib/rss-parser";
import type { FeedRefreshMessage } from "../lib/queue-messages";
import { isRefreshJobActive } from "../lib/queue-helpers";
import type { Env } from "../types";

/**
 * Returns the most recent episodes from a parsed feed, sorted newest-first.
 */
function latestEpisodes(episodes: ParsedEpisode[], max: number): ParsedEpisode[] {
  return [...episodes]
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, max);
}

/**
 * Process a single podcast: fetch RSS, parse, upsert episodes, notify subscribers.
 */
async function processPodcast(
  podcast: any,
  prisma: any,
  env: Env,
  log: any,
  maxEpisodes: number,
  fetchTimeoutMs: number,
  refreshJobId?: string
): Promise<{ newEpisodeIds: string[] }> {
  // Fetch RSS with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  let xml: string;
  try {
    const response = await fetch(podcast.feedUrl, { signal: controller.signal });
    xml = await response.text();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      log.error("feed_fetch_timeout", {
        podcastId: podcast.id,
        title: podcast.title,
        feedUrl: podcast.feedUrl,
        timeoutMs: fetchTimeoutMs,
      });
      throw new Error(`RSS fetch timed out after ${fetchTimeoutMs}ms: ${podcast.feedUrl}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const feed = parseRssFeed(xml);

  // Write the RSS language tag to the podcast record
  if (feed.language) {
    await prisma.podcast.update({
      where: { id: podcast.id },
      data: { language: feed.language },
    });

    // Mark non-English podcasts as pending_deletion
    const lang = feed.language.toLowerCase();
    if (!lang.startsWith("en")) {
      await prisma.podcast.update({
        where: { id: podcast.id },
        data: { status: "pending_deletion" },
      });
      log.info("non_english_podcast", {
        podcastId: podcast.id,
        language: feed.language,
        title: podcast.title,
      });
      return { newEpisodeIds: [] };
    }
  }

  const recent = latestEpisodes(feed.episodes, maxEpisodes);
  const newEpisodeIds: string[] = [];

  // Collect existing GUIDs for dedup
  const existingEpisodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id },
    select: { guid: true },
  });
  const existingGuids = new Set(existingEpisodes.map((e: any) => e.guid));

  for (const ep of recent) {
    if (!ep.guid || !ep.audioUrl) continue;

    const episode = await prisma.episode.upsert({
      where: {
        podcastId_guid: {
          podcastId: podcast.id,
          guid: ep.guid,
        },
      },
      update: {},
      create: {
        podcastId: podcast.id,
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audioUrl,
        publishedAt: ep.publishedAt ? new Date(ep.publishedAt) : null,
        durationSeconds: ep.durationSeconds,
        guid: ep.guid,
        transcriptUrl: ep.transcriptUrl,
      },
    });

    if (!existingGuids.has(ep.guid)) {
      newEpisodeIds.push(episode.id);
    }
  }

  // Track new episodes for refresh job
  if (refreshJobId && newEpisodeIds.length > 0) {
    await prisma.episodeRefreshJob.update({
      where: { id: refreshJobId },
      data: {
        podcastsWithNewEpisodes: { increment: 1 },
        episodesDiscovered: { increment: newEpisodeIds.length },
        prefetchTotal: { increment: newEpisodeIds.length },
      },
    }).catch(() => {});
  }

  // Queue content prefetch for new episodes
  if (newEpisodeIds.length > 0) {
    await env.CONTENT_PREFETCH_QUEUE.sendBatch(
      newEpisodeIds.map((id) => ({
        body: {
          episodeId: id,
          ...(refreshJobId && { refreshJobId }),
        },
      }))
    );
  }

  log.info("podcast_refreshed", {
    podcastId: podcast.id,
    episodesProcessed: recent.length,
    newEpisodes: newEpisodeIds.length,
  });

  // Auto-create FeedItems for subscribers of new episodes
  if (newEpisodeIds.length > 0) {
    const subscriptions = await prisma.subscription.findMany({
      where: { podcastId: podcast.id },
      include: { user: { select: { defaultVoicePresetId: true } } },
    });

    if (subscriptions.length > 0) {
      const groupKey = (tier: number, vpId: string | null) => `${tier}:${vpId ?? ""}`;
      const tierVoiceGroups = new Map<string, { durationTier: number; voicePresetId: string | null; userIds: string[] }>();

      for (const sub of subscriptions) {
        const resolvedVoicePresetId = sub.voicePresetId ?? sub.user?.defaultVoicePresetId ?? null;
        const key = groupKey(sub.durationTier, resolvedVoicePresetId);
        if (!tierVoiceGroups.has(key)) {
          tierVoiceGroups.set(key, {
            durationTier: sub.durationTier,
            voicePresetId: resolvedVoicePresetId,
            userIds: [],
          });
        }
        tierVoiceGroups.get(key)!.userIds.push(sub.userId);
      }

      for (const episodeId of newEpisodeIds) {
        for (const [, group] of tierVoiceGroups) {
          const { durationTier, voicePresetId, userIds } = group;

          for (const userId of userIds) {
            await prisma.feedItem.upsert({
              where: {
                userId_episodeId_durationTier: { userId, episodeId, durationTier },
              },
              create: {
                userId,
                episodeId,
                podcastId: podcast.id,
                durationTier,
                source: "SUBSCRIPTION",
                status: "PENDING",
              },
              update: {},
            });
          }

          const request = await prisma.briefingRequest.create({
            data: {
              userId: userIds[0],
              targetMinutes: durationTier,
              items: [{
                podcastId: podcast.id,
                episodeId,
                durationTier,
                voicePresetId: voicePresetId ?? undefined,
                useLatest: false,
              }],
              isTest: false,
              status: "PENDING",
            },
          });

          await prisma.feedItem.updateMany({
            where: {
              episodeId,
              durationTier,
              userId: { in: userIds },
              status: "PENDING",
              requestId: null,
            },
            data: {
              requestId: request.id,
              status: "PROCESSING",
            },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: request.id,
            action: "evaluate",
          });

          log.info("subscriber_pipeline_dispatched", {
            podcastId: podcast.id,
            episodeId,
            durationTier,
            voicePresetId,
            subscriberCount: userIds.length,
            requestId: request.id,
          });
        }
      }
    }
  }

  // Update last fetched timestamp
  await prisma.podcast.update({
    where: { id: podcast.id },
    data: { lastFetchedAt: new Date() },
  });

  return { newEpisodeIds };
}

/**
 * Queue consumer for feed-refresh jobs.
 *
 * Processes podcasts in parallel using Promise.allSettled.
 * Supports both single podcastId (backward compat) and batched podcastIds messages.
 */
export async function handleFeedRefresh(
  batch: MessageBatch<FeedRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "feed-refresh", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Collect podcast IDs from all messages (supports both singular and plural)
    const podcastIds = new Set<string>();
    let fetchAll = false;
    let refreshJobId: string | undefined;
    for (const msg of batch.messages) {
      const body = msg.body;
      if (body.podcastIds) {
        for (const id of body.podcastIds) podcastIds.add(id);
      } else if (body.podcastId) {
        podcastIds.add(body.podcastId);
      } else {
        fetchAll = true;
      }
      if (body.refreshJobId) refreshJobId = body.refreshJobId;
    }

    log.debug("podcast_filter", { fetchAll, podcastIdCount: podcastIds.size });

    // Fetch podcasts
    let podcasts;
    if (fetchAll) {
      const refreshAll = await getConfig(prisma, "catalog.refreshAllPodcasts", false);
      if (refreshAll) {
        podcasts = await prisma.podcast.findMany({
          where: { status: { not: "archived" } },
        });
      } else {
        const subscribedPodcastIds = await prisma.subscription.findMany({
          select: { podcastId: true },
          distinct: ["podcastId"],
        });
        const ids = subscribedPodcastIds.map((s: any) => s.podcastId);
        podcasts = ids.length > 0
          ? await prisma.podcast.findMany({ where: { id: { in: ids } } })
          : [];
      }
    } else {
      podcasts = await prisma.podcast.findMany({
        where: { id: { in: [...podcastIds] } },
      });
    }

    log.debug("podcasts_loaded", { count: podcasts.length });

    const maxEpisodes = (await getConfig(prisma, "pipeline.feedRefresh.maxEpisodesPerPodcast", 5)) as number;
    const fetchTimeoutMs = (await getConfig(prisma, "pipeline.feedRefresh.fetchTimeoutMs", 10000)) as number;

    // Process all podcasts in parallel
    const results = await Promise.allSettled(
      podcasts.map(async (podcast: any) => {
        // Cooperative pause/cancel: skip if refresh job is no longer active
        let processed = false;
        if (refreshJobId) {
          const active = await isRefreshJobActive(prisma, refreshJobId);
          if (!active) {
            log.info("refresh_job_inactive", { podcastId: podcast.id, refreshJobId });
            return;
          }
          processed = true;
        }

        try {
          await processPodcast(podcast, prisma, env, log, maxEpisodes, fetchTimeoutMs, refreshJobId);
        } catch (err) {
          log.error("podcast_error", { podcastId: podcast.id }, err);

          if (refreshJobId) {
            await prisma.episodeRefreshError.create({
              data: {
                jobId: refreshJobId,
                phase: "feed_scan",
                message: err instanceof Error ? err.message : String(err),
                podcastId: podcast.id,
              },
            }).catch(() => {});
          }
        } finally {
          if (refreshJobId && processed) {
            await prisma.episodeRefreshJob.update({
              where: { id: refreshJobId },
              data: { podcastsCompleted: { increment: 1 } },
            }).catch(() => {});
          }
        }
      })
    );

    log.info("batch_complete", { podcastCount: podcasts.length });

    for (const msg of batch.messages) {
      msg.ack();
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

- [ ] **Step 2: Update tests for new message format and parallel processing**

Update `worker/queues/__tests__/feed-refresh.test.ts`. Key changes:
- Update `getConfig` mock to handle `pipeline.feedRefresh.fetchTimeoutMs` (return `10000`)
- Update ALL existing `mockFetch` assertions: `fetch(url)` is now `fetch(url, { signal })` — use `expect.objectContaining({ signal: expect.any(AbortSignal) })` as the second arg
- Add test for `podcastIds` (plural) message format
- Add test for fetch timeout logging
- Existing tests that use `podcastId` (singular) should still pass (backward compat)

Update the `getConfig` mock in `beforeEach`:

```typescript
(getConfig as any).mockImplementation(async (_p: any, key: string, fallback: any) => {
  if (key === "catalog.refreshAllPodcasts") return false;
  if (key === "pipeline.feedRefresh.maxEpisodesPerPodcast") return 5;
  if (key === "pipeline.feedRefresh.fetchTimeoutMs") return 10000;
  return fallback !== undefined ? fallback : true;
});
```

Update existing fetch assertion (e.g., line 113) from:

```typescript
expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed.xml");
```

to:

```typescript
expect(mockFetch).toHaveBeenCalledWith(
  "https://example.com/feed.xml",
  expect.objectContaining({ signal: expect.any(AbortSignal) })
);
```

Apply this pattern to ALL `mockFetch` call assertions in the test file.

Add new test cases:

```typescript
describe("batched podcastIds message format", () => {
  it("processes multiple podcasts from podcastIds array", async () => {
    const podcast1 = { id: "pod-1", feedUrl: "https://example.com/feed1.xml", title: "Pod 1" };
    const podcast2 = { id: "pod-2", feedUrl: "https://example.com/feed2.xml", title: "Pod 2" };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast1, podcast2]);
    mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
    mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1", podcastId: "pod-1", guid: "guid-1" });
    mockPrisma.podcast.update.mockResolvedValue(podcast1);

    const mockMsg = {
      body: { podcastIds: ["pod-1", "pod-2"] },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Both feeds fetched in parallel
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockMsg.ack).toHaveBeenCalled();
  });
});

describe("fetch timeout", () => {
  it("logs timeout and continues processing other podcasts", async () => {
    const podcast1 = { id: "pod-1", feedUrl: "https://slow.example.com/feed.xml", title: "Slow Pod" };
    const podcast2 = { id: "pod-2", feedUrl: "https://fast.example.com/feed.xml", title: "Fast Pod" };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast1, podcast2]);
    mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
    mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1" });
    mockPrisma.podcast.update.mockResolvedValue(podcast2);

    // First fetch aborts (simulate timeout), second succeeds
    const abortError = new DOMException("The operation was aborted", "AbortError");
    mockFetch
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({ text: vi.fn().mockResolvedValue("<rss></rss>") });

    const mockMsg = {
      body: { podcastIds: ["pod-1", "pod-2"] },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Timeout logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      "podcast_error",
      { podcastId: "pod-1" },
      expect.any(Error)
    );

    // Second podcast still processed
    expect(mockMsg.ack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/feed-refresh.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add worker/queues/feed-refresh.ts worker/queues/__tests__/feed-refresh.test.ts
git commit -m "feat: parallelize feed-refresh with Promise.allSettled + fetch timeout"
```

---

### Task 4: Update all producers to use batched helper

**Files:**
- Modify: `worker/routes/admin/episode-refresh.ts:152-160` (POST /) and `:248-256` (POST /:id/resume)
- Modify: `worker/lib/cron/pipeline-trigger.ts:36-44`
- Modify: `worker/routes/admin/pipeline.ts:370-378`
- Modify: `worker/queues/catalog-refresh.ts:408-416`
- Modify: `worker/routes/admin/catalog-seed.ts:370-379`
- Modify: `worker/routes/admin/clean-r2.ts:49-58`

All these follow the same pattern — replace the old "one message per podcast" loop with a call to `sendBatchedFeedRefresh`. Each needs to read the `batchConcurrency` config first.

- [ ] **Step 1: Update episode-refresh.ts POST / route**

Replace lines 152-160:

```typescript
import { getConfig } from "../../lib/config";
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";

// ... inside POST / handler, replace BATCH_SIZE loop with:
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { refreshJobId: job.id });
```

- [ ] **Step 2: Update episode-refresh.ts POST /:id/resume route**

Replace lines 248-256 (the feed-refresh sendBatch loop only, keep the content-prefetch loop):

```typescript
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, targetPodcastIds, batchConcurrency, { refreshJobId: id });
```

- [ ] **Step 3: Update pipeline-trigger.ts**

Replace lines 36-44:

```typescript
import { sendBatchedFeedRefresh } from "../queue-helpers";
import { getConfig } from "../config";

// ... inside the function, replace BATCH_SIZE loop with:
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { type: "cron", refreshJobId: job.id });
```

- [ ] **Step 4: Update pipeline.ts multi-podcast path**

Replace lines 376-378 (the `for` loop sending individual messages):

```typescript
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";
import { getConfig } from "../../lib/config";

// ... replace the for loop:
const podcastIds = podcasts.map((p: any) => p.id);
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { type: "manual" });
```

Note: The single-podcast path (line 366) stays as-is — `send()` with `podcastId` singular.

- [ ] **Step 5: Update catalog-refresh.ts `queueFeedRefresh` helper**

Replace the function at lines 408-417:

```typescript
import { sendBatchedFeedRefresh } from "../lib/queue-helpers";
import { getConfig } from "../lib/config";

async function queueFeedRefresh(env: Env, prisma: any, podcastIds: string[], refreshJobId?: string): Promise<void> {
  if (podcastIds.length === 0) return;
  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, {
    type: "manual",
    ...(refreshJobId && { refreshJobId }),
  });
}
```

Note: This changes the function signature to accept `prisma`. Update all call sites to pass `prisma` as the second argument. The function is called from within `handleCatalogRefresh` which already has a `prisma` instance.

- [ ] **Step 6: Update catalog-seed.ts**

Replace lines 370-379:

```typescript
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";
import { getConfig } from "../../lib/config";

// ... replace BATCH_SIZE loop:
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, allIds, batchConcurrency, {
  type: "manual",
  ...(refreshJobId && { refreshJobId }),
});
```

- [ ] **Step 7: Update clean-r2.ts**

Replace lines 49-58. Preserve the `queued` counter — set it from `podcastIds.length` since `sendBatchedFeedRefresh` is void:

```typescript
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";
import { getConfig } from "../../lib/config";

// ... replace BATCH_SIZE loop:
const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, {
  type: "manual",
  ...(refreshJobId && { refreshJobId }),
});
const queued = podcastIds.length;
```

- [ ] **Step 8: Update pipeline-triggers.test.ts**

The multi-podcast feed-refresh trigger in `pipeline.ts` now uses `sendBatch` (via `sendBatchedFeedRefresh`) instead of individual `send` calls. Update `worker/routes/admin/__tests__/pipeline-triggers.test.ts`:

Change assertions from:
```typescript
expect(env.FEED_REFRESH_QUEUE.send).toHaveBeenCalledTimes(2);
```
to:
```typescript
expect(env.FEED_REFRESH_QUEUE.sendBatch).toHaveBeenCalled();
```

The single-podcast trigger test (which uses `send()` directly) should remain unchanged.

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add worker/routes/admin/episode-refresh.ts worker/lib/cron/pipeline-trigger.ts worker/routes/admin/pipeline.ts worker/queues/catalog-refresh.ts worker/routes/admin/catalog-seed.ts worker/routes/admin/clean-r2.ts worker/routes/admin/__tests__/pipeline-triggers.test.ts
git commit -m "refactor: update all feed-refresh producers to use batched helper"
```

---

### Task 5: Update admin UI with new settings

**Files:**
- Modify: `src/pages/admin/podcast-settings.tsx:17-26`

- [ ] **Step 1: Add new config entries and read-only display**

Add to the `CATALOG_CONFIGS` array:

```typescript
{ key: "pipeline.feedRefresh.batchConcurrency", label: "Batch Concurrency", type: "number", description: "Podcasts processed in parallel per queue message", default: 10 },
{ key: "pipeline.feedRefresh.fetchTimeoutMs", label: "RSS Fetch Timeout (ms)", type: "number", description: "Timeout for each RSS feed request", default: 10000 },
```

Add a read-only info line below the config list. Hardcode the value (worker imports don't resolve in frontend):

```typescript
// Mirrors FEED_REFRESH_MAX_CONSUMERS in worker/lib/constants.ts — requires redeploy to change
const FEED_REFRESH_MAX_CONSUMERS = 50;
```

Add after the config list `</div>`:

```tsx
<div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
  <div className="flex items-center justify-between">
    <div className="min-w-0 flex-1 mr-4">
      <Label className="text-xs text-[#F9FAFB]">Max Concurrent Consumers</Label>
      <p className="text-[10px] text-[#9CA3AF] mt-0.5">Max parallel queue workers (deploy-time setting, requires redeploy to change)</p>
    </div>
    <span className="text-xs font-mono text-[#9CA3AF] tabular-nums">{FEED_REFRESH_MAX_CONSUMERS}</span>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/podcast-settings.tsx
git commit -m "feat: add feed-refresh batch/timeout settings to admin UI"
```

---

### Task 6: Update wrangler.jsonc

**Files:**
- Modify: `wrangler.jsonc:81` (staging) and `:248` (production)

- [ ] **Step 1: Bump max_concurrency from 5 to 50**

Staging (line 81):
```jsonc
"max_concurrency": 50,
```

Production (line 248):
```jsonc
"max_concurrency": 50,
```

- [ ] **Step 2: Commit**

```bash
git add wrangler.jsonc
git commit -m "config: bump feed-refresh max_concurrency from 5 to 50"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `docs/pipeline.md:387` (add after existing feedRefresh config row)
- Modify: `docs/architecture.md:180` (add after existing feedRefresh config row)

- [ ] **Step 1: Update pipeline.md config table**

Add after the `pipeline.feedRefresh.maxEpisodesPerPodcast` row:

```markdown
| `pipeline.feedRefresh.batchConcurrency` | number | `10` | Podcasts processed in parallel per queue message |
| `pipeline.feedRefresh.fetchTimeoutMs` | number | `10000` | RSS fetch timeout per podcast (ms) |
```

- [ ] **Step 2: Update architecture.md config table**

Add after the `pipeline.feedRefresh.maxEpisodesPerPodcast` row:

```markdown
| `pipeline.feedRefresh.batchConcurrency` | Podcasts processed in parallel per queue message |
| `pipeline.feedRefresh.fetchTimeoutMs` | RSS fetch timeout per podcast (ms) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/pipeline.md docs/architecture.md
git commit -m "docs: document feed-refresh batch concurrency and timeout config"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Verify no regressions in existing producer tests**

Run: `npx vitest run worker/routes/admin/__tests__/podcasts-refresh.test.ts worker/routes/admin/__tests__/pipeline-triggers.test.ts`
Expected: All pass (`podcasts-refresh` uses `podcastId` singular which is backward compatible; `pipeline-triggers` was updated in Task 4 Step 8)
