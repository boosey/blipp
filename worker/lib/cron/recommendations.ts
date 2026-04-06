import type { CronLogger } from "./runner";
import { getConfig } from "../config";

type PrismaLike = object;

/**
 * Recommendations job: rebuilds podcast recommendation profiles in batches.
 * Each cron tick processes a batch of podcasts and stores a cursor for the next tick.
 * When all podcasts are processed, the cursor resets and the cycle begins again.
 *
 * Uses PlatformConfig key "recommendations.profileCursor" to persist position.
 */
export async function runRecommendationsJob(
  prisma: PrismaLike,
  logger: CronLogger,
  env?: any
): Promise<Record<string, unknown>> {
  const { computePodcastProfiles } = await import("../recommendations");

  // Load cursor from previous run
  const cursor = await getConfig(prisma as any, "recommendations.profileCursor", null) as string | null;

  const result = await computePodcastProfiles(prisma as any, env, cursor);

  // Persist cursor for next tick (null means cycle complete — reset)
  await (prisma as any).platformConfig.upsert({
    where: { key: "recommendations.profileCursor" },
    create: { key: "recommendations.profileCursor", value: result.cursor },
    update: { value: result.cursor },
  });

  if (result.cursor === null && result.processed > 0) {
    await logger.info("recommendation_profiles_cycle_complete", {
      batchProcessed: result.processed,
    });
  } else {
    await logger.info("recommendation_profiles_batch", {
      batchProcessed: result.processed,
      cursor: result.cursor,
    });
  }

  return { processed: result.processed, cursor: result.cursor, cycleComplete: result.cursor === null };
}
