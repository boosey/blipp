import type { CronLogger } from "./runner";
import type { Env } from "../../types";
import type { BriefingRequestItem, OrchestratorMessage } from "../queue-messages";

type PrismaLike = {
  podcast: { findMany: (args: any) => Promise<any[]> };
  episode: { findMany: (args: any) => Promise<any[]> };
  catalogBriefing: {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<any>;
  };
  briefingRequest: { create: (args: any) => Promise<any> };
  user: { findFirst: (args: any) => Promise<any> };
};

const CATALOG_PODCAST_LIMIT = 50;
const PODCASTS_PER_REQUEST = 25;

/**
 * Catalog Pre-generation job: generates full 5-min briefings for the top
 * podcasts so they can be instantly delivered to new users on signup.
 *
 * Selects podcasts by appleRank (top chart position). For each, takes the
 * latest episode and checks if a CatalogBriefing already exists. If not,
 * dispatches a CATALOG-mode BriefingRequest through the full pipeline.
 *
 * Also marks older CatalogBriefings as stale when a newer episode is available.
 */
export async function runCatalogPregenJob(
  prisma: PrismaLike,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  await logger.info(`Scanning top ${CATALOG_PODCAST_LIMIT} ranked podcasts for catalog pre-generation`);

  // Find top podcasts by rank (appleRank is 1-200, lower = more popular)
  const podcasts = await prisma.podcast.findMany({
    where: {
      deliverable: true,
      appleRank: { not: null },
    },
    select: { id: true, title: true, appleRank: true },
    orderBy: { appleRank: "asc" },
    take: CATALOG_PODCAST_LIMIT,
  });

  if (podcasts.length === 0) {
    await logger.info("no_ranked_podcasts", { message: "No podcasts with appleRank found" });
    return { podcastsScanned: 0, episodesQueued: 0 };
  }

  // For each podcast, get latest episode and check for existing catalog briefing
  const podcastIds = podcasts.map((p: any) => p.id);

  const latestEpisodes = await prisma.episode.findMany({
    where: { podcastId: { in: podcastIds } },
    orderBy: { publishedAt: "desc" },
    distinct: ["podcastId"] as any,
    select: { id: true, podcastId: true, title: true },
  });

  const latestByPodcast = new Map(latestEpisodes.map((e: any) => [e.podcastId, e]));

  // Check which episodes already have catalog briefings
  const latestEpisodeIds = latestEpisodes.map((e: any) => e.id);
  const existingCatalog = await prisma.catalogBriefing.findMany({
    where: { episodeId: { in: latestEpisodeIds }, durationTier: 5, stale: false },
    select: { episodeId: true },
  });
  const alreadyCataloged = new Set(existingCatalog.map((cb: any) => cb.episodeId));

  // Build items for episodes that need catalog generation
  const items: BriefingRequestItem[] = [];
  const staleMarkPodcastIds: string[] = [];

  for (const podcast of podcasts) {
    const latestEp = latestByPodcast.get(podcast.id);
    if (!latestEp) continue;

    if (alreadyCataloged.has(latestEp.id)) continue;

    items.push({
      podcastId: podcast.id,
      episodeId: latestEp.id,
      durationTier: 5,
      useLatest: false,
    });

    // Mark older catalog briefings for this podcast as stale
    staleMarkPodcastIds.push(podcast.id);
  }

  // Mark stale in bulk
  if (staleMarkPodcastIds.length > 0) {
    const staleResult = await prisma.catalogBriefing.updateMany({
      where: {
        podcastId: { in: staleMarkPodcastIds },
        episodeId: { notIn: latestEpisodeIds },
        stale: false,
      },
      data: { stale: true },
    });
    await logger.info("stale_marked", { count: staleResult.count });
  }

  if (items.length === 0) {
    await logger.info("all_current", {
      podcastsScanned: podcasts.length,
      alreadyCataloged: alreadyCataloged.size,
    });
    return { podcastsScanned: podcasts.length, episodesQueued: 0, alreadyCataloged: alreadyCataloged.size };
  }

  // Need an admin user to own the requests
  const adminUser = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) {
    await logger.error("no_admin_user", { message: "No admin user found to own catalog requests" });
    return { error: "No admin user" };
  }

  // Chunk and dispatch
  const requestIds: string[] = [];
  for (let i = 0; i < items.length; i += PODCASTS_PER_REQUEST) {
    const chunk = items.slice(i, i + PODCASTS_PER_REQUEST);

    const req = await prisma.briefingRequest.create({
      data: {
        userId: adminUser.id,
        status: "PENDING",
        targetMinutes: 5,
        items: chunk as any,
        mode: "CATALOG",
      },
      select: { id: true },
    });
    requestIds.push(req.id);

    const msg: OrchestratorMessage = {
      requestId: req.id,
      action: "evaluate",
      correlationId: req.id,
    };
    await (env.ORCHESTRATOR_QUEUE as any).send(msg);
  }

  await logger.info("catalog_pregen_dispatched", {
    podcastsScanned: podcasts.length,
    episodesQueued: items.length,
    requestsCreated: requestIds.length,
    alreadyCataloged: alreadyCataloged.size,
  });

  return {
    podcastsScanned: podcasts.length,
    episodesQueued: items.length,
    requestsCreated: requestIds.length,
    requestIds,
    alreadyCataloged: alreadyCataloged.size,
  };
}
