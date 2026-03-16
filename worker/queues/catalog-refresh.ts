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

        const source = getCatalogSource("apple");
        const discovered = await source.discover(200, env);
        console.log(`[catalog-refresh] Discovered ${discovered.length} unique podcasts`);

        await updateStatus(prisma, "resolving_metadata");
        const categoryIdMap = await upsertCategories(prisma, discovered);

        await updateStatus(prisma, "upserting");
        const upsertedIds = await upsertPodcasts(prisma, discovered, categoryIdMap);

        if (action === "refresh") {
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

async function upsertPodcasts(
  prisma: any,
  discovered: DiscoveredPodcast[],
  categoryIdMap: Map<string, string>
): Promise<string[]> {
  const upsertedIds: string[] = [];

  for (const podcast of discovered) {
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
      source: "apple",
    };

    try {
      const upserted = await prisma.podcast.upsert({
        where: { feedUrl: podcast.feedUrl },
        update: { ...data, status: undefined },
        create: { ...data, feedUrl: podcast.feedUrl, status: "active" },
      });

      // Auto-restore pending_deletion podcasts that reappear in charts
      if (upserted.status === "pending_deletion") {
        await prisma.podcast.update({
          where: { id: upserted.id },
          data: { status: "active" },
        });
      }

      upsertedIds.push(upserted.id);

      // Update PodcastCategory join records
      const genreIds = (podcast.categories ?? [])
        .filter((c) => c.genreId !== "26")
        .map((c) => c.genreId);

      await prisma.podcastCategory.deleteMany({ where: { podcastId: upserted.id } });

      const joinRecords = genreIds
        .map((genreId) => {
          const categoryId = categoryIdMap.get(genreId);
          if (!categoryId) return null;
          return { podcastId: upserted.id, categoryId };
        })
        .filter(Boolean);

      if (joinRecords.length > 0) {
        await prisma.podcastCategory.createMany({ data: joinRecords, skipDuplicates: true });
      }
    } catch (err) {
      console.warn(`[catalog-refresh] Failed to upsert "${podcast.title}":`, err);
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
