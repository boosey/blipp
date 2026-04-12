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

  const timeBudgetMs = await getConfig(prisma as any, "recommendations.timeBudgetMs", 25_000) as number;
  const startTime = Date.now();
  let totalProcessed = 0;
  let batches = 0;
  let cursor = await getConfig(prisma as any, "recommendations.profileCursor", null) as string | null;

  await logger.info(cursor
    ? `Resuming recommendation profiles from cursor ${cursor}`
    : "Starting new recommendation profile cycle", { timeBudgetMs });

  // Loop through batches until cycle completes or time budget is exhausted
  while (true) {
    const result = await computePodcastProfiles(prisma as any, env, cursor);
    totalProcessed += result.processed;
    batches++;
    cursor = result.cursor;

    // Persist cursor after each batch so progress isn't lost on Worker timeout
    await (prisma as any).platformConfig.upsert({
      where: { key: "recommendations.profileCursor" },
      create: { key: "recommendations.profileCursor", value: cursor },
      update: { value: cursor },
    });

    // Cycle complete or no more podcasts
    if (cursor === null || result.processed === 0) break;

    // Time budget check — leave headroom for the final batch
    if (Date.now() - startTime > timeBudgetMs) {
      await logger.info("recommendation_profiles_time_budget", {
        totalProcessed,
        batches,
        elapsedMs: Date.now() - startTime,
        cursor,
      });
      break;
    }
  }

  if (cursor === null && totalProcessed > 0) {
    await logger.info("recommendation_profiles_cycle_complete", {
      totalProcessed,
      batches,
    });
  } else if (cursor !== null) {
    await logger.info("recommendation_profiles_partial", {
      totalProcessed,
      batches,
      cursor,
    });
  }

  return { processed: totalProcessed, batches, cursor, cycleComplete: cursor === null };
}
