import type { CronLogger } from "./runner";
import type { Env } from "../../types";
import { getConfig } from "../config";
import { sendBatchedFeedRefresh } from "../queue-helpers";

type PrismaLike = {
  podcast: { findMany: (args: any) => Promise<any[]> };
  episodeRefreshJob: { create: (args: any) => Promise<any> };
  platformConfig: { findUnique: (args: any) => Promise<any> };
};

/**
 * Episode refresh job: checks all podcast feeds for new episodes.
 * Refreshes all non-archived podcasts regardless of subscription status.
 * Creates an EpisodeRefreshJob to track progress.
 */
export async function runEpisodeRefreshJob(
  prisma: PrismaLike,
  env: Env,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  await logger.info("Querying active podcasts for feed refresh");

  const podcasts = await prisma.podcast.findMany({
    where: { status: { not: "archived" } },
    select: { id: true },
  });
  const podcastIds = podcasts.map((p: any) => p.id);

  await logger.info(`Found ${podcastIds.length} active podcasts`);

  const job = await prisma.episodeRefreshJob.create({
    data: {
      trigger: "cron",
      scope: "all",
      status: "refreshing",
      podcastsTotal: podcastIds.length,
    },
  });

  await logger.info("Created EpisodeRefreshJob", { refreshJobId: job.id });

  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { type: "cron", refreshJobId: job.id });

  await logger.info("Feed refresh enqueued", {
    refreshJobId: job.id,
    podcastsTotal: podcastIds.length,
    batchConcurrency,
  });
  return { enqueued: true, trigger: "cron", refreshJobId: job.id, podcastsTotal: podcastIds.length };
}
