import type { Env } from "../types";
import type { CatalogRefreshMessage } from "../lib/queue-messages";
import { createPrismaClient } from "../lib/db";
import { getCatalogSource } from "../lib/catalog-sources";
import type { DiscoveredPodcast } from "../lib/catalog-sources";

export async function handleCatalogRefresh(
  batch: MessageBatch<CatalogRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { action } = msg.body;
      console.log(`[catalog-refresh] Starting ${action}...`);

      try {
        await updateStatus(prisma, "fetching_charts");

        if (action === "seed") {
          await wipeCatalogData(prisma);
        }

        const source = getCatalogSource("podcast-index");
        const discovered = await source.discover(2000, env);
        console.log(`[catalog-refresh] Discovered ${discovered.length} unique podcasts`);

        await updateStatus(prisma, "resolving_metadata");
        const categoryIdMap = await upsertCategories(prisma, discovered);

        await updateStatus(prisma, "upserting");
        let upsertedIds: string[];

        if (action === "seed") {
          // Bulk insert — DB was just wiped so no conflicts
          upsertedIds = await bulkInsertPodcasts(prisma, discovered, categoryIdMap);
        } else {
          upsertedIds = await upsertPodcasts(prisma, discovered, categoryIdMap);
          await markPendingDeletion(prisma, upsertedIds);
        }

        await queueFeedRefresh(env, upsertedIds);

        await updateStatus(prisma, "complete");
        console.log(`[catalog-refresh] ${action} complete. ${upsertedIds.length} podcasts processed.`);
        msg.ack();
      } catch (err) {
        console.error(`[catalog-refresh] ${action} failed:`, err);
        await updateStatus(prisma, "failed");
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

async function updateStatus(prisma: any, status: string): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: "catalogRefresh.status" },
    update: { value: status },
    create: { key: "catalogRefresh.status", value: status, description: "Catalog refresh status" },
  });
}

async function wipeCatalogData(prisma: any): Promise<void> {
  await prisma.feedItem.deleteMany({});
  await prisma.briefing.deleteMany({});
  await prisma.briefingRequest.deleteMany({});
  await prisma.clip.deleteMany({});
  await prisma.distillation.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.episode.deleteMany({});
  await prisma.podcast.deleteMany({});
  await prisma.category.deleteMany({});
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
  categoryIdMap: Map<string, string>
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
        source: "podcast-index",
        feedUrl: p.feedUrl,
        status: "active",
      })),
      skipDuplicates: true,
    });
    console.log(`[catalog-refresh] Inserted ${Math.min(i + BATCH, valid.length)}/${valid.length} podcasts`);
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
  categoryIdMap: Map<string, string>
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
        source: "podcast-index",
      };

      try {
        const upserted = await prisma.podcast.upsert({
          where: { feedUrl: podcast.feedUrl },
          update: { ...data, status: undefined },
          create: { ...data, feedUrl: podcast.feedUrl, status: "active" },
        });

        if (upserted.status === "pending_deletion") {
          await prisma.podcast.update({
            where: { id: upserted.id },
            data: { status: "active" },
          });
        }

        upsertedIds.push(upserted.id);
      } catch (err) {
        console.warn(`[catalog-refresh] Failed to upsert "${podcast.title}":`, err);
      }
    }

    console.log(`[catalog-refresh] Upserted ${Math.min(i + CHUNK, discovered.length)}/${discovered.length} podcasts`);

    // Batch PodcastCategory joins per chunk
    const joinRecords: { podcastId: string; categoryId: string }[] = [];
    const podcastsInChunk = await prisma.podcast.findMany({
      where: { feedUrl: { in: chunk.filter((p) => p.feedUrl).map((p) => p.feedUrl) } },
      select: { id: true, feedUrl: true },
    });
    const feedToId = new Map<string, string>(podcastsInChunk.map((p: any) => [p.feedUrl, p.id]));

    // Clear old joins for this chunk
    const chunkIds = podcastsInChunk.map((p: any) => p.id);
    if (chunkIds.length > 0) {
      await prisma.podcastCategory.deleteMany({ where: { podcastId: { in: chunkIds } } });
    }

    for (const podcast of chunk) {
      const podcastId = feedToId.get(podcast.feedUrl);
      if (!podcastId) continue;
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

async function queueFeedRefresh(env: Env, podcastIds: string[]): Promise<void> {
  if (podcastIds.length === 0) return;
  const messages = podcastIds.map((podcastId) => ({
    body: { podcastId, type: "manual" as const },
  }));
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    await env.FEED_REFRESH_QUEUE.sendBatch(messages.slice(i, i + BATCH_SIZE));
  }
}
