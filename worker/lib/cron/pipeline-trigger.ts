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
 * Fetch New Episodes job: checks all podcast feeds for new episodes.
 * Refreshes all non-archived podcasts regardless of subscription status.
 * Creates an EpisodeRefreshJob to track progress.
 */
export async function runPipelineTriggerJob(
  prisma: PrismaLike,
  env: Env,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const podcasts = await prisma.podcast.findMany({
    where: { status: { not: "archived" } },
    select: { id: true },
  });
  const podcastIds = podcasts.map((p: any) => p.id);

  // Create tracking job
  const job = await prisma.episodeRefreshJob.create({
    data: {
      trigger: "cron",
      scope: "all",
      status: "refreshing",
      podcastsTotal: podcastIds.length,
    },
  });

  // Queue feed refresh in batched chunks
  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { type: "cron", refreshJobId: job.id });

  await logger.info("feed_refresh_enqueued", {
    trigger: "cron",
    refreshJobId: job.id,
    podcastsTotal: podcastIds.length,
    scope: "all",
  });
  return { enqueued: true, trigger: "cron", refreshJobId: job.id, podcastsTotal: podcastIds.length };
}
