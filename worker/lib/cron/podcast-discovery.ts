import type { CronLogger } from "./runner";
import type { Env } from "../../types";

/**
 * Podcast Discovery job: triggers an additive catalog seed from Apple
 * via the CATALOG_REFRESH_QUEUE.
 */
export async function runPodcastDiscoveryJob(
  prisma: any,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  const job = await prisma.catalogSeedJob.create({
    data: { mode: "additive", source: "apple", trigger: "cron" },
  });

  await env.CATALOG_REFRESH_QUEUE.send({
    action: "seed",
    mode: "additive",
    source: "apple",
    seedJobId: job.id,
  });

  await logger.info("podcast_discovery_queued", { seedJobId: job.id });
  return { seedJobId: job.id };
}
