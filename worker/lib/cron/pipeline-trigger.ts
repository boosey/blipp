import type { CronLogger } from "./runner";
import type { Env } from "../../types";

type PrismaLike = {
  podcast: { findMany: (args: any) => Promise<any[]> };
  episodeRefreshJob: { create: (args: any) => Promise<any> };
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

  // Queue feed refresh in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < podcastIds.length; i += BATCH_SIZE) {
    const batch = podcastIds.slice(i, i + BATCH_SIZE);
    await env.FEED_REFRESH_QUEUE.sendBatch(
      batch.map((podcastId: string) => ({
        body: { podcastId, type: "cron" as const, refreshJobId: job.id },
      }))
    );
  }

  await logger.info("feed_refresh_enqueued", {
    trigger: "cron",
    refreshJobId: job.id,
    podcastsTotal: podcastIds.length,
    scope: "all",
  });
  return { enqueued: true, trigger: "cron", refreshJobId: job.id, podcastsTotal: podcastIds.length };
}
