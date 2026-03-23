import { getConfig } from "../config";
import type { CronLogger } from "./runner";
import type { Env } from "../../types";

type PrismaLike = {
  platformConfig: { upsert: (args: any) => Promise<any> };
  subscription: { findMany: (args: any) => Promise<any[]> };
  podcast: { findMany: (args: any) => Promise<any[]> };
  episodeRefreshJob: { create: (args: any) => Promise<any> };
};

/**
 * Pipeline Trigger job: enqueues a feed refresh cycle.
 * Respects the master pipeline.enabled flag independently of the cron-level enabled toggle.
 * Also updates pipeline.lastAutoRunAt for backward compatibility with the pipeline controls page.
 * Creates an EpisodeRefreshJob to track progress.
 */
export async function runPipelineTriggerJob(
  prisma: PrismaLike,
  env: Env,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const pipelineEnabled = await getConfig(prisma as any, "pipeline.enabled", true);
  if (!pipelineEnabled) {
    await logger.info("pipeline_disabled", { skipped: true });
    return { skipped: true, reason: "pipeline_disabled" };
  }

  // Determine target podcasts
  const refreshAll = await getConfig(prisma as any, "catalog.refreshAllPodcasts", false);
  let podcastIds: string[];

  if (refreshAll) {
    const podcasts = await prisma.podcast.findMany({
      where: { status: { not: "archived" } },
      select: { id: true },
    });
    podcastIds = podcasts.map((p: any) => p.id);
  } else {
    const subscribedPodcastIds = await prisma.subscription.findMany({
      select: { podcastId: true },
      distinct: ["podcastId"],
    });
    podcastIds = subscribedPodcastIds.map((s: any) => s.podcastId);
  }

  const scope = refreshAll ? "all" : "subscribed";

  // Create tracking job
  const job = await prisma.episodeRefreshJob.create({
    data: {
      trigger: "cron",
      scope,
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

  // Keep pipeline.lastAutoRunAt in sync for the Pipeline Controls page
  await prisma.platformConfig.upsert({
    where: { key: "pipeline.lastAutoRunAt" },
    update: { value: new Date().toISOString() },
    create: {
      key: "pipeline.lastAutoRunAt",
      value: new Date().toISOString(),
      description: "Timestamp of last automatic pipeline run",
    },
  });

  await logger.info("feed_refresh_enqueued", {
    trigger: "cron",
    refreshJobId: job.id,
    podcastsTotal: podcastIds.length,
    scope,
  });
  return { enqueued: true, trigger: "cron", refreshJobId: job.id, podcastsTotal: podcastIds.length };
}
