import { getConfig } from "../config";
import type { CronLogger } from "./runner";

type PrismaLike = {
  platformConfig: { upsert: (args: any) => Promise<any> };
  episode: { count: (args: any) => Promise<number> };
  podcast: { count: (args: any) => Promise<number> };
  briefingRequest: { deleteMany: (args: any) => Promise<{ count: number }> };
  episodeRefreshJob: { updateMany: (args: any) => Promise<{ count: number }> };
  feedItem: { updateMany: (args: any) => Promise<{ count: number }> };
  pipelineJob: {
    findMany: (args: any) => Promise<{ requestId: string | null }[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  pipelineStep: { updateMany: (args: any) => Promise<{ count: number }> };
};

/**
 * Data Retention job: counts/deletes aged episodes, counts stale podcasts,
 * and deletes old completed/failed briefing requests.
 */
export async function runDataRetentionJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // Episode aging — count candidates (actual deletion is manual via admin UI)
  const agingEnabled = await getConfig(prisma as any, "episodes.aging.enabled", false);
  if (agingEnabled) {
    const maxAgeDays = await getConfig<number>(prisma as any, "episodes.aging.maxAgeDays", 180);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (maxAgeDays as number));

    const agingCount = await prisma.episode.count({
      where: {
        publishedAt: { lt: cutoff },
        feedItems: { none: { status: { in: ["PENDING", "PROCESSING"] } } },
      },
    });

    if (agingCount > 0) {
      await prisma.platformConfig.upsert({
        where: { key: "episodes.aging.candidateCount" },
        update: { value: agingCount },
        create: {
          key: "episodes.aging.candidateCount",
          value: agingCount,
          description: "Episodes eligible for aging deletion",
        },
      });
    }

    await logger.info("episode_aging_checked", { agingCount, maxAgeDays });
    result.episodeAgingCandidates = agingCount;
  }

  // Catalog cleanup — count stale podcasts (no subscriptions, not archived)
  const cleanupEnabled = await getConfig(prisma as any, "catalog.cleanup.enabled", false);
  if (cleanupEnabled) {
    const cleanupCount = await prisma.podcast.count({
      where: {
        status: { not: "archived" },
        subscriptions: { none: {} },
      },
    });

    if (cleanupCount > 0) {
      await prisma.platformConfig.upsert({
        where: { key: "catalog.cleanup.candidateCount" },
        update: { value: cleanupCount },
        create: {
          key: "catalog.cleanup.candidateCount",
          value: cleanupCount,
          description: "Podcasts eligible for cleanup",
        },
      });
    }

    await logger.info("catalog_cleanup_checked", { cleanupCount });
    result.catalogCleanupCandidates = cleanupCount;
  }

  // Briefing request archiving — hard delete old completed/failed requests
  const archivingEnabled = await getConfig(prisma as any, "requests.archiving.enabled", false);
  if (archivingEnabled) {
    const maxAgeDays = await getConfig<number>(
      prisma as any,
      "requests.archiving.maxAgeDays",
      30
    );
    const cutoff = new Date(Date.now() - (maxAgeDays as number) * 24 * 60 * 60 * 1000);
    const { count } = await prisma.briefingRequest.deleteMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        createdAt: { lt: cutoff },
      },
    });
    await logger.info("requests_archived", { count, maxAgeDays });
    result.requestsArchived = count;
  }

  // Stale job reaper — mark IN_PROGRESS jobs as FAILED if not updated in 30 minutes
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);

  // Find stale jobs first so we can propagate failures to linked FeedItems
  const staleJobRecords = await prisma.pipelineJob.findMany({
    where: {
      status: "IN_PROGRESS",
      updatedAt: { lt: staleCutoff },
    },
    select: { requestId: true },
  });

  const { count: staleJobs } = await prisma.pipelineJob.updateMany({
    where: {
      status: "IN_PROGRESS",
      updatedAt: { lt: staleCutoff },
    },
    data: {
      status: "FAILED",
      errorMessage: "Marked failed: job stalled for over 30 minutes",
      completedAt: new Date(),
    },
  });

  if (staleJobs > 0) {
    // Also fail their in-progress steps
    await prisma.pipelineStep.updateMany({
      where: {
        status: "IN_PROGRESS",
        startedAt: { lt: staleCutoff },
      },
      data: {
        status: "FAILED",
        errorMessage: "Marked failed: step stalled for over 30 minutes",
        completedAt: new Date(),
      },
    });

    // Fail FeedItems linked to reaped jobs
    const requestIds = staleJobRecords
      .map((j) => j.requestId)
      .filter((id): id is string => id !== null);
    if (requestIds.length > 0) {
      await prisma.feedItem.updateMany({
        where: { requestId: { in: requestIds }, status: "PROCESSING" },
        data: {
          status: "FAILED",
          errorMessage: "Marked failed: pipeline job stalled for over 30 minutes",
        },
      });
    }

    await logger.info("stale_jobs_reaped", { count: staleJobs });
  }
  result.staleJobsReaped = staleJobs;

  // Orphaned FeedItem reaper — catch items stuck in PROCESSING with no active pipeline job
  // (e.g. orchestrator queue message lost, or request never picked up)
  const { count: staleFeedItems } = await prisma.feedItem.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: staleCutoff },
    },
    data: {
      status: "FAILED",
      errorMessage: "Marked failed: feed item stalled for over 30 minutes",
    },
  });
  if (staleFeedItems > 0) {
    await logger.info("stale_feed_items_reaped", { count: staleFeedItems });
  }
  result.staleFeedItemsReaped = staleFeedItems;

  // Stale EpisodeRefreshJob reaper — mark "refreshing" jobs as failed if started > 60 minutes ago.
  // Previous fixes (ed9640a, 54dfc55) addressed prefetch counter drift, but podcastsCompleted
  // increments can still fail silently (.catch swallows DB errors), leaving jobs stuck forever.
  const refreshJobCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const { count: staleRefreshJobs } = await prisma.episodeRefreshJob.updateMany({
    where: {
      status: "refreshing",
      startedAt: { lt: refreshJobCutoff },
    },
    data: {
      status: "failed",
      error: "Marked failed: refresh job stalled for over 6 hours",
      completedAt: new Date(),
    },
  });
  if (staleRefreshJobs > 0) {
    await logger.info("stale_refresh_jobs_reaped", { count: staleRefreshJobs });
  }
  result.staleRefreshJobsReaped = staleRefreshJobs;

  return result;
}
