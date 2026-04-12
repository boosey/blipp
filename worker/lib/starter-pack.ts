import type { OrchestratorMessage, BriefingRequestItem } from "./queue-messages";

/**
 * Delivers a starter pack of pre-generated catalog briefings to a new user.
 *
 * Selects CatalogBriefings matching the user's preferred categories, falling
 * back to the most popular podcasts if no preferences are set. Creates a
 * USER-mode BriefingRequest + FeedItems so the orchestrator resolves from
 * cache (audio already exists) and the user sees briefings instantly.
 */
export async function deliverStarterPack(params: {
  userId: string;
  preferredCategories: string[];
  prisma: any;
  orchestratorQueue: { send: (msg: OrchestratorMessage) => Promise<void> };
  maxItems?: number;
}): Promise<{ delivered: number; requestId: string | null }> {
  const { userId, preferredCategories, prisma, orchestratorQueue, maxItems = 5 } = params;

  // Check if user already has subscriptions (they picked podcasts during onboarding)
  const subscriptionCount = await prisma.subscription.count({ where: { userId } });
  if (subscriptionCount > 0) {
    return { delivered: 0, requestId: null };
  }

  // Query fresh catalog briefings, preferring those matching user interests
  let catalogItems: any[];

  if (preferredCategories.length > 0) {
    // First try: podcasts matching preferred categories
    catalogItems = await prisma.catalogBriefing.findMany({
      where: {
        stale: false,
        podcast: {
          categories: { hasSome: preferredCategories },
        },
      },
      include: {
        podcast: { select: { id: true, categories: true, appleRank: true } },
        episode: { select: { id: true } },
      },
      orderBy: { podcast: { appleRank: "asc" } },
      take: maxItems,
    });

    // Backfill with popular podcasts if not enough matches
    if (catalogItems.length < maxItems) {
      const excludeIds = catalogItems.map((ci: any) => ci.id);
      const backfill = await prisma.catalogBriefing.findMany({
        where: {
          stale: false,
          id: { notIn: excludeIds },
        },
        include: {
          podcast: { select: { id: true, categories: true, appleRank: true } },
          episode: { select: { id: true } },
        },
        orderBy: { podcast: { appleRank: "asc" } },
        take: maxItems - catalogItems.length,
      });
      catalogItems = [...catalogItems, ...backfill];
    }
  } else {
    // No preferences — deliver top podcasts by rank
    catalogItems = await prisma.catalogBriefing.findMany({
      where: { stale: false },
      include: {
        podcast: { select: { id: true, categories: true, appleRank: true } },
        episode: { select: { id: true } },
      },
      orderBy: { podcast: { appleRank: "asc" } },
      take: maxItems,
    });
  }

  if (catalogItems.length === 0) {
    return { delivered: 0, requestId: null };
  }

  // Build BriefingRequest items
  const items: BriefingRequestItem[] = catalogItems.map((ci: any) => ({
    podcastId: ci.podcast.id,
    episodeId: ci.episode.id,
    durationTier: ci.durationTier,
    useLatest: false,
  }));

  // Create BriefingRequest (USER mode so it creates proper Briefing + FeedItem records)
  const request = await prisma.briefingRequest.create({
    data: {
      userId,
      status: "PENDING",
      targetMinutes: 5,
      items: items as any,
      mode: "USER",
    },
    select: { id: true },
  });

  // Create FeedItems for each catalog item
  for (const ci of catalogItems) {
    await prisma.feedItem.upsert({
      where: {
        userId_episodeId_durationTier: {
          userId,
          episodeId: ci.episode.id,
          durationTier: ci.durationTier,
        },
      },
      create: {
        userId,
        podcastId: ci.podcast.id,
        episodeId: ci.episode.id,
        durationTier: ci.durationTier,
        requestId: request.id,
        source: "CATALOG",
        status: "PENDING",
      },
      update: {},
    });
  }

  // Dispatch to orchestrator — will hit audio cache and resolve to BRIEFING_ASSEMBLY
  const msg: OrchestratorMessage = {
    requestId: request.id,
    action: "evaluate",
    correlationId: request.id,
  };
  await orchestratorQueue.send(msg);

  return { delivered: catalogItems.length, requestId: request.id };
}
