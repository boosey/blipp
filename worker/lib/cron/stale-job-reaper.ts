import type { CronLogger } from "./runner";

type PrismaLike = {
  episodeRefreshJob: {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  feedItem: { updateMany: (args: any) => Promise<{ count: number }> };
  pipelineJob: {
    findMany: (args: any) => Promise<{ requestId: string | null }[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  pipelineStep: { updateMany: (args: any) => Promise<{ count: number }> };
};

/**
 * Stale Job Reaper: marks stalled jobs as failed across all job types.
 *
 * - PipelineJob/PipelineStep: IN_PROGRESS > 30 minutes
 * - FeedItem: PROCESSING > 30 minutes (propagated from reaped jobs + orphaned)
 * - EpisodeRefreshJob: "refreshing" > 6 hours (counter drift from swallowed errors)
 */
export async function runStaleJobReaperJob(
  prisma: PrismaLike,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // ── PipelineJob + PipelineStep (30 min) ──
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

  // ── Orphaned FeedItems (30 min) ──
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

  // ── EpisodeRefreshJob (6 hours) ──
  // Previous fixes (ed9640a, 54dfc55) addressed prefetch counter drift, but
  // podcastsCompleted increments can still fail silently, leaving jobs stuck.
  // Jobs that reached >90% progress are marked complete instead of failed.
  const refreshJobCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const staleRefreshRecords = await prisma.episodeRefreshJob.findMany({
    where: {
      status: "refreshing",
      startedAt: { lt: refreshJobCutoff },
    },
    select: {
      id: true,
      podcastsTotal: true,
      podcastsCompleted: true,
      prefetchTotal: true,
      prefetchCompleted: true,
    },
  });

  const nearCompleteIds: string[] = [];
  const trulyFailedIds: string[] = [];
  for (const job of staleRefreshRecords) {
    const total = (job.podcastsTotal || 0) + (job.prefetchTotal || 0);
    const completed = (job.podcastsCompleted || 0) + (job.prefetchCompleted || 0);
    const pct = total > 0 ? completed / total : 0;
    if (pct >= 0.9) {
      nearCompleteIds.push(job.id);
    } else {
      trulyFailedIds.push(job.id);
    }
  }

  let staleRefreshCompleted = 0;
  if (nearCompleteIds.length > 0) {
    const { count } = await prisma.episodeRefreshJob.updateMany({
      where: { id: { in: nearCompleteIds } },
      data: {
        status: "complete",
        completedAt: new Date(),
      },
    });
    staleRefreshCompleted = count;
    await logger.info("stale_refresh_jobs_completed", { count });
  }

  let staleRefreshFailed = 0;
  if (trulyFailedIds.length > 0) {
    const { count } = await prisma.episodeRefreshJob.updateMany({
      where: { id: { in: trulyFailedIds } },
      data: {
        status: "failed",
        error: "Marked failed: refresh job stalled for over 6 hours",
        completedAt: new Date(),
      },
    });
    staleRefreshFailed = count;
    await logger.info("stale_refresh_jobs_reaped", { count });
  }

  result.staleRefreshJobsCompleted = staleRefreshCompleted;
  result.staleRefreshJobsReaped = staleRefreshFailed;

  return result;
}
