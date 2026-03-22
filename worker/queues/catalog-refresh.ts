import type { Env } from "../types";
import type { CatalogRefreshMessage } from "../lib/queue-messages";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { getCatalogSource } from "../lib/catalog-sources";
import type { DiscoveredPodcast } from "../lib/catalog-sources";

const DEFAULT_DISCOVER_COUNT = 2000;

export async function handleCatalogRefresh(
  batch: MessageBatch<CatalogRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { action, mode, seedJobId } = msg.body;
      const seedMode = mode ?? "destructive";
      console.log(`[catalog-refresh] Starting ${action} (mode: ${seedMode})...`);

      try {
        await updateStatus(prisma, "fetching_charts");
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "discovering" });

        if (action === "seed" && seedMode === "destructive") {
          await wipeCatalogData(prisma, env.R2);
        }

        // ── Phase 1: Apple source (top 100, authoritative) ──
        const appleSource = getCatalogSource("apple");
        let appleDiscovered: DiscoveredPodcast[] = [];
        try {
          appleDiscovered = await appleSource.discover(100, env);
          console.log(`[catalog-refresh] Apple: discovered ${appleDiscovered.length} podcasts`);
        } catch (err) {
          console.warn("[catalog-refresh] Apple source failed, continuing with PI only:", err);
        }

        // ── Phase 2: Podcast Index source ──
        const discoverCount = Number(await getConfig(prisma, "catalog.seedSize", DEFAULT_DISCOVER_COUNT));
        const piSource = getCatalogSource("podcast-index");
        const piDiscovered = await piSource.discover(discoverCount, env);
        console.log(`[catalog-refresh] Podcast Index: discovered ${piDiscovered.length} podcasts`);

        const totalDiscovered = appleDiscovered.length + piDiscovered.length;
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { podcastsDiscovered: totalDiscovered });

        // ── Upsert categories from both sources ──
        await updateStatus(prisma, "resolving_metadata");
        const allDiscovered = [...appleDiscovered, ...piDiscovered];
        const categoryIdMap = await upsertCategories(prisma, allDiscovered);

        // ── Upsert podcasts: Apple first (authoritative), then PI (fills nulls) ──
        await updateStatus(prisma, "upserting");
        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "upserting" });
        let upsertedIds: string[];

        if (action === "seed" && seedMode === "destructive") {
          // Bulk insert — DB was just wiped so no conflicts
          const appleIds = appleDiscovered.length > 0
            ? await bulkInsertPodcasts(prisma, appleDiscovered, categoryIdMap, "apple")
            : [];
          const piIds = await bulkInsertPodcasts(prisma, piDiscovered, categoryIdMap, "podcast-index");
          upsertedIds = [...appleIds, ...piIds];
        } else if (action === "seed" && seedMode === "additive") {
          // Apple first — insert new ones
          let appleIds: string[] = [];
          if (appleDiscovered.length > 0) {
            const newApple = await filterNewPodcasts(prisma, appleDiscovered);
            if (newApple.length > 0) {
              appleIds = await bulkInsertPodcasts(prisma, newApple, categoryIdMap, "apple");
            }
            console.log(`[catalog-refresh] Additive Apple: ${appleIds.length} new of ${appleDiscovered.length}`);
          }
          // PI second — insert new ones
          const newPI = await filterNewPodcasts(prisma, piDiscovered);
          console.log(`[catalog-refresh] Additive PI: ${newPI.length} new of ${piDiscovered.length}`);
          const piIds = newPI.length > 0
            ? await bulkInsertPodcasts(prisma, newPI, categoryIdMap, "podcast-index")
            : [];
          upsertedIds = [...appleIds, ...piIds];
        } else {
          // Refresh mode: Apple first (authoritative), PI second (fill nulls only)
          const appleIds = appleDiscovered.length > 0
            ? await upsertPodcasts(prisma, appleDiscovered, categoryIdMap, "apple")
            : [];
          const piIds = await upsertPodcasts(prisma, piDiscovered, categoryIdMap, "podcast-index");
          upsertedIds = [...new Set([...appleIds, ...piIds])];
          await markPendingDeletion(prisma, upsertedIds);
        }

        if (seedJobId) await updateSeedJob(prisma, seedJobId, { status: "feed_refresh", feedsTotal: upsertedIds.length });
        await queueFeedRefresh(env, upsertedIds, seedJobId);

        await updateStatus(prisma, "complete");
        console.log(`[catalog-refresh] ${action} (${seedMode}) complete. ${upsertedIds.length} podcasts processed.`);
        msg.ack();
      } catch (err) {
        console.error(`[catalog-refresh] ${action} failed:`, err);
        await updateStatus(prisma, "failed");
        if (seedJobId) {
          await updateSeedJob(prisma, seedJobId, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        }
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

async function updateSeedJob(prisma: any, seedJobId: string, data: Record<string, unknown>): Promise<void> {
  await prisma.catalogSeedJob.update({ where: { id: seedJobId }, data });
}

async function updateStatus(prisma: any, status: string): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: "catalogRefresh.status" },
    update: { value: status },
    create: { key: "catalogRefresh.status", value: status, description: "Catalog refresh status" },
  });
}

async function wipeCatalogData(prisma: any, r2: R2Bucket): Promise<void> {
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
  console.log(`[catalog-refresh] Deleted ${totalDeleted} R2 objects`);
}

async function filterNewPodcasts(prisma: any, discovered: DiscoveredPodcast[]): Promise<DiscoveredPodcast[]> {
  const feedUrls = discovered.filter((p) => p.feedUrl).map((p) => p.feedUrl);
  const BATCH = 500;
  const existingUrls = new Set<string>();

  for (let i = 0; i < feedUrls.length; i += BATCH) {
    const batch = feedUrls.slice(i, i + BATCH);
    const existing = await prisma.podcast.findMany({
      where: { feedUrl: { in: batch } },
      select: { feedUrl: true },
    });
    for (const p of existing) existingUrls.add(p.feedUrl);
  }

  return discovered.filter((p) => p.feedUrl && !existingUrls.has(p.feedUrl));
}

async function upsertCategories(prisma: any, discovered: DiscoveredPodcast[]): Promise<Map<string, string>> {
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
  prisma: any,
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
      })),
      skipDuplicates: true,
    });
    console.log(`[catalog-refresh] [${sourceId}] Inserted ${Math.min(i + BATCH, valid.length)}/${valid.length} podcasts`);
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
    console.log(`[catalog-refresh] Created ${joinRecords.length} category associations`);
  }

  return created.map((p: any) => p.id);
}

async function upsertPodcasts(
  prisma: any,
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
            appleMetadata: podcast.appleMetadata ?? undefined,
            language: "en",
            source: sourceId,
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
        console.warn(`[catalog-refresh] [${sourceId}] Failed to upsert "${podcast.title}":`, err);
      }
    }

    console.log(`[catalog-refresh] [${sourceId}] Upserted ${Math.min(i + CHUNK, discovered.length)}/${discovered.length} podcasts`);

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

async function markPendingDeletion(prisma: any, chartPodcastIds: string[]): Promise<void> {
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

async function queueFeedRefresh(env: Env, podcastIds: string[], seedJobId?: string): Promise<void> {
  if (podcastIds.length === 0) return;
  const messages = podcastIds.map((podcastId) => ({
    body: { podcastId, type: "manual" as const, ...(seedJobId && { seedJobId }) },
  }));
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    await env.FEED_REFRESH_QUEUE.sendBatch(messages.slice(i, i + BATCH_SIZE));
  }
}
