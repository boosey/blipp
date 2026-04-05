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

  return result;
}
