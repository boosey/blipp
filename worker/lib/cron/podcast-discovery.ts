import type { CronLogger } from "./runner";
import type { Env } from "../../types";

/**
 * Apple Discovery job: triggers an additive catalog seed from Apple
 * via the CATALOG_REFRESH_QUEUE.
 */
export async function runAppleDiscoveryJob(
  prisma: any,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  await logger.info("Creating Apple Podcasts catalog seed job");

  const job = await prisma.catalogSeedJob.create({
    data: { mode: "additive", source: "apple", trigger: "cron" },
  });

  await env.CATALOG_REFRESH_QUEUE.send({
    action: "seed",
    mode: "additive",
    source: "apple",
    seedJobId: job.id,
  });

  await logger.info("Apple discovery queued", { seedJobId: job.id });
  return { seedJobId: job.id };
}

/**
 * Podcast Index Discovery job: triggers an additive catalog seed from
 * Podcast Index via the CATALOG_REFRESH_QUEUE.
 */
export async function runPodcastIndexDiscoveryJob(
  prisma: any,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  await logger.info("Creating Podcast Index catalog seed job");

  const job = await prisma.catalogSeedJob.create({
    data: { mode: "additive", source: "podcast-index", trigger: "cron" },
  });

  await env.CATALOG_REFRESH_QUEUE.send({
    action: "seed",
    mode: "additive",
    source: "podcast-index",
    seedJobId: job.id,
  });

  await logger.info("Podcast Index discovery queued", { seedJobId: job.id });
  return { seedJobId: job.id };
}
