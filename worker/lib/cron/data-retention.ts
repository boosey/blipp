import { getConfig } from "../config";
import type { CronLogger } from "./runner";

type PrismaLike = {
  platformConfig: { upsert: (args: any) => Promise<any> };
  episode: { count: (args: any) => Promise<number> };
  podcast: { count: (args: any) => Promise<number> };
  briefingRequest: { deleteMany: (args: any) => Promise<{ count: number }> };
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

    await logger.info(`Checking episode aging (cutoff: ${maxAgeDays} days)`);

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
      await logger.info(`${agingCount} episode(s) eligible for aging deletion`);
    } else {
      await logger.info("No episodes eligible for aging");
    }
    result.episodeAgingCandidates = agingCount;
  } else {
    await logger.info("Episode aging: disabled");
  }

  // Catalog cleanup — count stale podcasts (no subscriptions, not archived)
  const cleanupEnabled = await getConfig(prisma as any, "catalog.cleanup.enabled", false);
  if (cleanupEnabled) {
    await logger.info("Checking catalog cleanup candidates");

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
      await logger.info(`${cleanupCount} podcast(s) eligible for cleanup`);
    } else {
      await logger.info("No podcasts eligible for cleanup");
    }
    result.catalogCleanupCandidates = cleanupCount;
  } else {
    await logger.info("Catalog cleanup: disabled");
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

    await logger.info(`Archiving completed/failed requests older than ${maxAgeDays} days`);

    const { count } = await prisma.briefingRequest.deleteMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        createdAt: { lt: cutoff },
      },
    });

    if (count > 0) {
      await logger.info(`Archived ${count} old briefing request(s)`);
    } else {
      await logger.info("No briefing requests to archive");
    }
    result.requestsArchived = count;
  } else {
    await logger.info("Request archiving: disabled");
  }

  return result;
}
