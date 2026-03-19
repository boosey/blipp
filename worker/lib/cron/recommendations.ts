import type { CronLogger } from "./runner";

type PrismaLike = object;

/**
 * Recommendations job: rebuilds podcast recommendation profiles for all users.
 * Wraps worker/lib/recommendations.ts computePodcastProfiles.
 */
export async function runRecommendationsJob(
  prisma: PrismaLike,
  logger: CronLogger,
  env?: any
): Promise<Record<string, unknown>> {
  const { computePodcastProfiles } = await import("../recommendations");
  const profileCount = await computePodcastProfiles(prisma as any, env);
  await logger.info("recommendation_profiles_refreshed", { profileCount });
  return { profileCount };
}
