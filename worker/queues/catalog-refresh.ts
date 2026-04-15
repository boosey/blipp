import type { Env } from "../types";
import type { CatalogRefreshMessage } from "../lib/queue-messages";
import { createPrismaClient, type PrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { getCatalogSource } from "../lib/catalog-sources";
import type { DiscoveredPodcast } from "../lib/catalog-sources";
import { evictToFit } from "../lib/catalog-eviction";

const DEFAULT_DISCOVER_COUNT = 20;

export async function handleCatalogRefresh(
  batch: MessageBatch<CatalogRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { action, mode, source, seedJobId } = msg.body;
      const seedMode = mode ?? "destructive";
      const sourceId = source ?? "apple";
      console.log(JSON.stringify({ level: "info", action: "catalog_refresh_start", catalogAction: action, seedMode, sourceId, ts: new Date().toISOString() }));

      try {
        await updateStatus(prisma, "fetching_charts");
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "discovering" });

        if (action === "seed" && seedMode === "destructive") {
          await wipeCatalogData(prisma, env.R2);
        }

        // ── Discover from the requested source ──
        const catalogSource = getCatalogSource(sourceId);
        const discoverCount = sourceId === "apple"
          ? 100
          : Number(await getConfig(prisma, "catalog.seedSize", DEFAULT_DISCOVER_COUNT));
        const discovered = await catalogSource.discover(discoverCount, env, prisma);
        console.log(JSON.stringify({ level: "info", action: "catalog_refresh_discovered", source: catalogSource.name, count: discovered.length, ts: new Date().toISOString() }));

        // ── Upsert categories ──
        await updateStatus(prisma, "resolving_metadata");
        const categoryIdMap = await upsertCategories(prisma, discovered);

        // ── Upsert podcasts ──
        await updateStatus(prisma, "upserting");
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "upserting" });
        let upsertedIds: string[];

        if (action === "seed" && seedMode === "destructive") {
          upsertedIds = discovered.length > 0
            ? await bulkInsertPodcasts(prisma, discovered, categoryIdMap, sourceId)
            : [];
        } else if (action === "seed" && seedMode === "additive") {
          let newIds: string[] = [];
          if (discovered.length > 0) {
            // Update appleRank for all discovered podcasts (existing + new)
            await updateAppleRanks(prisma, discovered);
            // Update piRank for PI-sourced podcasts
            await updatePiRanks(prisma, discovered);

            let newPodcasts = await filterNewPodcasts(prisma, discovered);

            // Enforce catalog size limit: evict least-valuable podcasts to make room
            if (newPodcasts.length > 0) {
              const maxSize = Number(await getConfig(prisma, "catalog.maxSize", 10000));
              const { evicted, shortfall } = await evictToFit(prisma, newPodcasts.length, maxSize);
              if (evicted > 0) {
                console.log(JSON.stringify({ level: "info", action: "catalog_eviction", evicted, ts: new Date().toISOString() }));
              }
              if (shortfall > 0) {
                console.warn(JSON.stringify({ level: "warn", action: "catalog_eviction_shortfall", shortfall, message: "All remaining podcasts have engagement signals", ts: new Date().toISOString() }));
                newPodcasts = newPodcasts.slice(0, newPodcasts.length - shortfall);
              }
            }

            if (newPodcasts.length > 0) {
              newIds = await bulkInsertPodcasts(prisma, newPodcasts, categoryIdMap, sourceId);
            }
            console.log(JSON.stringify({ level: "info", action: "catalog_refresh_additive", source: catalogSource.name, newCount: newIds.length, totalDiscovered: discovered.length, ts: new Date().toISOString() }));
          }
          upsertedIds = newIds;
        } else {
          upsertedIds = discovered.length > 0
            ? await upsertPodcasts(prisma, discovered, categoryIdMap, sourceId)
            : [];
          await markPendingDeletion(prisma, upsertedIds);
        }

        // Update podcastsDiscovered with only NEW podcasts (not total discovered)
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { podcastsDiscovered: upsertedIds.length });

        // Create an EpisodeRefreshJob to track feed refresh progress
        let refreshJobId: string | undefined;
        if (upsertedIds.length > 0) {
          const refreshJob = await prisma.episodeRefreshJob.create({
            data: {
              trigger: "seed",
              scope: "seed",
              status: "refreshing",
              podcastsTotal: upsertedIds.length,
              catalogSeedJobId: seedJobId,
            },
          });
          refreshJobId = refreshJob.id;
        }

        // Mark CatalogSeedJob as complete (discovery is done)
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "complete", completedAt: new Date() });

        await queueFeedRefresh(env, prisma, upsertedIds, refreshJobId);

        await updateStatus(prisma, "complete");
        console.log(JSON.stringify({ level: "info", action: "catalog_refresh_complete", catalogAction: action, seedMode, sourceId, processedCount: upsertedIds.length, ts: new Date().toISOString() }));
        msg.ack();
      } catch (err) {
        console.error(JSON.stringify({ level: "error", action: "catalog_refresh_failed", catalogAction: action, error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
        await updateStatus(prisma, "failed");
        if (seedJobId) {
          await updateSeedJob(prisma, seedJobId, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});

          // Record error to CatalogJobError
          await prisma.catalogJobError.create({
            data: {
              jobId: seedJobId,
              phase: "discovery",
              message: err instanceof Error ? err.message : String(err),
            },
          }).catch(() => {});
        }
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

async function updateSeedJob(prisma: PrismaClient, seedJobId: string, data: Record<string, unknown>): Promise<void> {

  await prisma.catalogSeedJob.update({ where: { id: seedJobId }, data });
}

async function updateStatus(prisma: PrismaClient, status: string): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: "catalogRefresh.status" },
    update: { value: status },
    create: { key: "catalogRefresh.status", value: status, description: "Catalog refresh status" },
  });
}

async function wipeCatalogData(prisma: PrismaClient, r2: R2Bucket): Promise<void> {
  // Delete DB records
  await prisma.feedItem.deleteMany({});
  await prisma.briefing.deleteMany({});
  await prisma.briefingRequest.deleteMany({});
  await prisma.clip.deleteMany({});
  await prisma.distillation.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.episode.deleteMany({});
  await prisma.podcast.deleteMany({});
  await prisma.category.deleteMany({});

  // Delete all work products from R2
  let totalDeleted = 0;
  let cursor: string | undefined;
  do {
    const listed = await r2.list({ prefix: "wp/", cursor, limit: 500 });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => r2.delete(obj.key)));
      totalDeleted += listed.objects.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  console.log(JSON.stringify({ level: "info", action: "catalog_refresh_r2_wipe", deletedCount: totalDeleted, ts: new Date().toISOString() }));
}

/**
 * Updates appleRank for existing podcasts and clears rank for podcasts no longer in the chart.
 */
async function updateAppleRanks(prisma: PrismaClient, discovered: DiscoveredPodcast[]): Promise<void> {
  const withRank = discovered.filter((p) => p.appleId && p.appleRank != null);
  if (withRank.length === 0) return;

  // Clear rank for all podcasts that previously had one (they may have dropped off the chart)
  await prisma.podcast.updateMany({
    where: { appleRank: { not: null } },
    data: { appleRank: null },
  });

  // Set rank for current chart entries (match by appleId which is more reliable than feedUrl)
  const BATCH = 50;
  let updated = 0;
  for (let i = 0; i < withRank.length; i += BATCH) {
    const chunk = withRank.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((p) =>
        prisma.podcast.updateMany({
          where: { appleId: p.appleId },
          data: { appleRank: p.appleRank },
        })
      )
    );
    updated += results.reduce((sum, r) => sum + r.count, 0);
  }

  console.log(JSON.stringify({ level: "info", action: "catalog_refresh_ranks_updated", discovered: withRank.length, updated, ts: new Date().toISOString() }));
}

async function filterNewPodcasts(prisma: PrismaClient, discovered: DiscoveredPodcast[]): Promise<DiscoveredPodcast[]> {
  const feedUrls = discovered.filter((p) => p.feedUrl).map((p) => p.feedUrl);
  const BATCH = 500;
  const existingUrls = new Set<string>();

  for (let i = 0; i < feedUrls.length; i += BATCH) {
    const batch = feedUrls.slice(i, i + BATCH);
    const existing = await prisma.podcast.findMany({
      where: { feedUrl: { in: batch } },
      select: { feedUrl: true, status: true },
    });
    // Skip both existing active podcasts AND evicted ones (prevent churn)
    for (const p of existing) existingUrls.add(p.feedUrl);
  }

  return discovered.filter((p) => p.feedUrl && !existingUrls.has(p.feedUrl));
}

/**
 * Updates piRank for existing PI-sourced podcasts based on their trending position.
 */
async function updatePiRanks(prisma: PrismaClient, discovered: DiscoveredPodcast[]): Promise<void> {
  const withRank = discovered.filter((p) => p.podcastIndexId && p.piRank != null);
  if (withRank.length === 0) return;

  const BATCH = 50;
  let updated = 0;
  for (let i = 0; i < withRank.length; i += BATCH) {
    const chunk = withRank.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((p) =>
        prisma.podcast.updateMany({
          where: { podcastIndexId: p.podcastIndexId },
          data: { piRank: p.piRank },
        })
      )
    );
    updated += results.reduce((sum, r) => sum + r.count, 0);
  }

  console.log(JSON.stringify({ level: "info", action: "catalog_refresh_pi_ranks_updated", discovered: withRank.length, updated, ts: new Date().toISOString() }));
}

async function upsertCategories(prisma: PrismaClient, discovered: DiscoveredPodcast[]): Promise<Map<string, string>> {
  const genreMap = new Map<string, string>();
  for (const podcast of discovered) {
    for (const cat of podcast.categories ?? []) {
      if (cat.genreId && cat.genreId !== "26") {
        genreMap.set(cat.genreId, cat.name);
      }
    }
  }

  const categoryIdMap = new Map<string, string>();
  for (const [genreId, name] of genreMap) {
    const category = await prisma.category.upsert({
      where: { appleGenreId: genreId },
      update: { name },
      create: { appleGenreId: genreId, name },
    });
    categoryIdMap.set(genreId, category.id);
  }
  return categoryIdMap;
}

/**
 * Bulk insert for seed (DB is empty, no conflict handling needed).
 * Uses createMany in batches of 500 — much faster than individual upserts.
 */
async function bulkInsertPodcasts(
  prisma: PrismaClient,
  discovered: DiscoveredPodcast[],
  categoryIdMap: Map<string, string>,
  sourceId: string
): Promise<string[]> {
  const BATCH = 500;
  const valid = discovered.filter((p) => p.feedUrl);

  // createMany in batches
  for (let i = 0; i < valid.length; i += BATCH) {
    const chunk = valid.slice(i, i + BATCH);
    await prisma.podcast.createMany({
      data: chunk.map((p) => ({
        title: p.title,
        description: p.description,
        imageUrl: p.imageUrl,
        author: p.author,
        appleId: p.appleId,
        podcastIndexId: p.podcastIndexId,
        categories: (p.categories ?? []).filter((c) => c.genreId !== "26").map((c) => c.name),
        language: "en",
        source: sourceId,
        feedUrl: p.feedUrl,
        status: "active",
        appleRank: p.appleRank ?? null,
        piRank: p.piRank ?? null,
      })),
      skipDuplicates: true,
    });
    console.log(JSON.stringify({ level: "info", action: "catalog_refresh_bulk_insert", sourceId, progress: Math.min(i + BATCH, valid.length), total: valid.length, ts: new Date().toISOString() }));
  }

  // Fetch all created podcast IDs
  const created = await prisma.podcast.findMany({
    where: { feedUrl: { in: valid.map((p) => p.feedUrl) } },
    select: { id: true, feedUrl: true },
  });
  const feedToId = new Map<string, string>(created.map((p: any) => [p.feedUrl, p.id]));

  // Bulk create PodcastCategory join records
  const joinRecords: { podcastId: string; categoryId: string }[] = [];
  for (const p of valid) {
    const podcastId = feedToId.get(p.feedUrl);
    if (!podcastId) continue;
    for (const cat of p.categories ?? []) {
      if (cat.genreId === "26") continue;
      const categoryId = categoryIdMap.get(cat.genreId);
      if (categoryId) joinRecords.push({ podcastId, categoryId });
    }
  }

  if (joinRecords.length > 0) {
    for (let i = 0; i < joinRecords.length; i += BATCH) {
      await prisma.podcastCategory.createMany({
        data: joinRecords.slice(i, i + BATCH),
        skipDuplicates: true,
      });
    }
    console.log(JSON.stringify({ level: "info", action: "catalog_refresh_categories", count: joinRecords.length, ts: new Date().toISOString() }));
  }

  return created.map((p: any) => p.id);
}

async function upsertPodcasts(
  prisma: PrismaClient,
  discovered: DiscoveredPodcast[],
  categoryIdMap: Map<string, string>,
  sourceId: string
): Promise<string[]> {
  const upsertedIds: string[] = [];
  const CHUNK = 100;

  // Process in chunks to avoid timeout
  for (let i = 0; i < discovered.length; i += CHUNK) {
    const chunk = discovered.slice(i, i + CHUNK);

    for (const podcast of chunk) {
      if (!podcast.feedUrl) continue;

      const categoryNames = (podcast.categories ?? [])
        .filter((c) => c.genreId !== "26")
        .map((c) => c.name);

      try {
        // Check if podcast already exists
        const existing = await prisma.podcast.findUnique({
          where: { feedUrl: podcast.feedUrl },
        });

        if (existing && existing.source === "apple" && sourceId === "podcast-index") {
          // Apple is authoritative — PI only fills null fields
          const nullFills: Record<string, unknown> = {};
          if (!existing.description && podcast.description) nullFills.description = podcast.description;
          if (!existing.imageUrl && podcast.imageUrl) nullFills.imageUrl = podcast.imageUrl;
          if (!existing.author && podcast.author) nullFills.author = podcast.author;
          if (!existing.podcastIndexId && podcast.podcastIndexId) nullFills.podcastIndexId = podcast.podcastIndexId;
          if ((!existing.categories || existing.categories.length === 0) && categoryNames.length > 0) {
            nullFills.categories = categoryNames;
          }

          if (Object.keys(nullFills).length > 0) {
            await prisma.podcast.update({ where: { id: existing.id }, data: nullFills });
          }

          if (existing.status === "pending_deletion") {
            await prisma.podcast.update({ where: { id: existing.id }, data: { status: "active" } });
          }

          upsertedIds.push(existing.id);
        } else {
          // Full upsert — either new podcast, or this source owns it
          const data = {
            title: podcast.title,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            author: podcast.author,
            appleId: podcast.appleId,
            podcastIndexId: podcast.podcastIndexId,
            categories: categoryNames,
            appleMetadata: (podcast.appleMetadata ?? undefined) as any,
            language: "en",
            source: sourceId,
            appleRank: podcast.appleRank ?? null,
          };

          const upserted = await prisma.podcast.upsert({
            where: { feedUrl: podcast.feedUrl },
            update: { ...data, status: undefined },
            create: { ...data, feedUrl: podcast.feedUrl, status: "active" },
          });

          if (upserted.status === "pending_deletion") {
            await prisma.podcast.update({ where: { id: upserted.id }, data: { status: "active" } });
          }

          upsertedIds.push(upserted.id);
        }
      } catch (err) {
        console.warn(JSON.stringify({ level: "warn", action: "catalog_refresh_upsert_failed", sourceId, title: podcast.title, error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
      }
    }

    console.log(JSON.stringify({ level: "info", action: "catalog_refresh_upsert_progress", sourceId, progress: Math.min(i + CHUNK, discovered.length), total: discovered.length, ts: new Date().toISOString() }));

    // Batch PodcastCategory joins per chunk
    const joinRecords: { podcastId: string; categoryId: string }[] = [];
    const podcastsInChunk = await prisma.podcast.findMany({
      where: { feedUrl: { in: chunk.filter((p) => p.feedUrl).map((p) => p.feedUrl) } },
      select: { id: true, feedUrl: true, source: true },
    });
    const feedToId = new Map<string, string>(podcastsInChunk.map((p: any) => [p.feedUrl, p.id]));
    const feedToSource = new Map<string, string>(podcastsInChunk.map((p: any) => [p.feedUrl, p.source]));

    // Only clear+replace category joins if this source owns the podcast
    const ownedChunkIds = podcastsInChunk
      .filter((p: any) => p.source !== "apple" || sourceId === "apple")
      .map((p: any) => p.id);
    if (ownedChunkIds.length > 0) {
      await prisma.podcastCategory.deleteMany({ where: { podcastId: { in: ownedChunkIds } } });
    }

    for (const podcast of chunk) {
      const podcastId = feedToId.get(podcast.feedUrl);
      if (!podcastId) continue;
      // Skip category replacement for Apple-sourced pods when PI is running
      const existingSource = feedToSource.get(podcast.feedUrl);
      if (existingSource === "apple" && sourceId === "podcast-index") continue;

      for (const cat of podcast.categories ?? []) {
        if (cat.genreId === "26") continue;
        const categoryId = categoryIdMap.get(cat.genreId);
        if (categoryId) joinRecords.push({ podcastId, categoryId });
      }
    }

    if (joinRecords.length > 0) {
      await prisma.podcastCategory.createMany({ data: joinRecords, skipDuplicates: true });
    }
  }

  return upsertedIds;
}

async function markPendingDeletion(prisma: PrismaClient, chartPodcastIds: string[]): Promise<void> {
  const chartIdSet = new Set(chartPodcastIds);
  const activePodcasts = await prisma.podcast.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  const toMark: string[] = [];
  for (const podcast of activePodcasts) {
    if (!chartIdSet.has(podcast.id)) {
      const subCount = await prisma.subscription.count({ where: { podcastId: podcast.id } });
      if (subCount === 0) toMark.push(podcast.id);
    }
  }

  if (toMark.length > 0) {
    await prisma.podcast.updateMany({
      where: { id: { in: toMark } },
      data: { status: "pending_deletion" },
    });
  }
}

async function queueFeedRefresh(env: Env, prisma: PrismaClient, podcastIds: string[], refreshJobId?: string): Promise<void> {
  if (podcastIds.length === 0) return;
  const { getConfig: gc } = await import("../lib/config");
  const { sendBatchedFeedRefresh } = await import("../lib/queue-helpers");
  const batchConcurrency = (await gc(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, {
    type: "manual",
    ...(refreshJobId && { refreshJobId }),
  });
}
