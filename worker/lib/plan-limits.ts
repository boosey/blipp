import type { Context } from "hono";
import type { Env } from "../types";

/**
 * Fetches the user with their plan included.
 * Use this instead of raw getCurrentUser when you need plan limit checks.
 */
export async function getUserWithPlan(c: Context<{ Bindings: Env }>, prisma: any) {
  const { getCurrentUser } = await import("./admin-helpers");
  const user = await getCurrentUser(c, prisma);
  if (user.plan) return user;

  // getCurrentUser doesn't include plan — fetch it
  return prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { plan: true },
  });
}

/**
 * Check if durationTier exceeds the plan's maxDurationMinutes.
 * Returns an error string if exceeded, null if OK.
 */
export function checkDurationLimit(
  durationTier: number,
  maxDurationMinutes: number
): string | null {
  if (durationTier > maxDurationMinutes) {
    return `Your plan allows briefings up to ${maxDurationMinutes} minutes. Upgrade to use ${durationTier}-minute briefings.`;
  }
  return null;
}

/**
 * Check if user has reached their podcast subscription limit.
 * Returns an error string if at limit, null if OK.
 */
export async function checkSubscriptionLimit(
  userId: string,
  maxPodcastSubscriptions: number | null,
  prisma: any
): Promise<string | null> {
  if (maxPodcastSubscriptions === null) return null; // unlimited

  const count = await prisma.subscription.count({ where: { userId } });
  if (count >= maxPodcastSubscriptions) {
    return `Your plan allows up to ${maxPodcastSubscriptions} podcast subscriptions. Upgrade for more.`;
  }
  return null;
}

/**
 * Check if user has reached their weekly briefing limit.
 * Counts briefing requests (both subscription and on-demand) in the last 7 days.
 * Returns an error string if at limit, null if OK.
 */
export async function checkWeeklyBriefingLimit(
  userId: string,
  briefingsPerWeek: number | null,
  prisma: any
): Promise<string | null> {
  if (briefingsPerWeek === null) return null; // unlimited

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const count = await prisma.feedItem.count({
    where: {
      userId,
      createdAt: { gte: oneWeekAgo },
    },
  });

  if (count >= briefingsPerWeek) {
    return `Your plan allows ${briefingsPerWeek} briefings per week. Upgrade for more.`;
  }
  return null;
}

/**
 * Check if the requested episode is within the plan's past episodes limit.
 * Counts the episode's position (by publishedAt desc) within its podcast.
 * Returns an error string if beyond limit, null if OK.
 */
export async function checkPastEpisodesLimit(
  episodeId: string,
  pastEpisodesLimit: number | null,
  prisma: any
): Promise<string | null> {
  if (pastEpisodesLimit === null) return null; // unlimited

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: { podcastId: true, publishedAt: true },
  });
  if (!episode) return null; // let downstream handle missing episode

  const position = await prisma.episode.count({
    where: {
      podcastId: episode.podcastId,
      publishedAt: { gte: episode.publishedAt ?? new Date(0) },
    },
  });

  if (position > pastEpisodesLimit) {
    return `Your plan allows access to the ${pastEpisodesLimit} most recent episodes. Upgrade for full archive access.`;
  }
  return null;
}

/**
 * Check if user has reached their concurrent pipeline job limit.
 * Counts IN_PROGRESS jobs for the user (via their briefing requests).
 * Returns an error string if at limit, null if OK.
 */
export async function checkConcurrentJobLimit(
  userId: string,
  concurrentPipelineJobs: number,
  prisma: any
): Promise<string | null> {
  const count = await prisma.pipelineJob.count({
    where: {
      status: "IN_PROGRESS",
      request: { userId },
    },
  });
  if (count >= concurrentPipelineJobs) {
    return `Your plan allows ${concurrentPipelineJobs} concurrent pipeline jobs. Please wait for current jobs to finish.`;
  }
  return null;
}

/**
 * Check if user's plan allows public sharing.
 * Returns an error string if not allowed, null if OK.
 */
export function checkPublicSharing(publicSharing: boolean): string | null {
  if (!publicSharing) {
    return "Public sharing is not available on your current plan. Upgrade to share briefings.";
  }
  return null;
}

/**
 * Check if user's plan allows transcript access.
 * Returns an error string if not allowed, null if OK.
 */
export function checkTranscriptAccess(transcriptAccess: boolean): string | null {
  if (!transcriptAccess) {
    return "Transcript access is not available on your current plan. Upgrade to view transcripts.";
  }
  return null;
}

export interface UsageData {
  period: { start: string; end: string; daysRemaining: number };
  briefings: { used: number; limit: number | null; remaining: number | null; percentUsed: number };
  subscriptions: { used: number; limit: number | null; remaining: number | null; percentUsed: number };
  maxDurationMinutes: number;
  pastEpisodesLimit: number | null;
  publicSharing: boolean;
  transcriptAccess: boolean;
  plan: { name: string; slug: string };
}

export async function getUserUsage(userId: string, prisma: any): Promise<UsageData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { plan: true },
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [briefingCount, subscriptionCount] = await Promise.all([
    prisma.feedItem.count({
      where: { userId, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.subscription.count({ where: { userId } }),
  ]);

  const plan = user.plan;
  return {
    period: {
      start: oneWeekAgo.toISOString(),
      end: new Date().toISOString(),
      daysRemaining: 7,
    },
    briefings: {
      used: briefingCount,
      limit: plan.briefingsPerWeek,
      remaining: plan.briefingsPerWeek !== null ? Math.max(0, plan.briefingsPerWeek - briefingCount) : null,
      percentUsed: plan.briefingsPerWeek !== null ? Math.round((briefingCount / plan.briefingsPerWeek) * 100) : 0,
    },
    subscriptions: {
      used: subscriptionCount,
      limit: plan.maxPodcastSubscriptions,
      remaining: plan.maxPodcastSubscriptions !== null ? Math.max(0, plan.maxPodcastSubscriptions - subscriptionCount) : null,
      percentUsed: plan.maxPodcastSubscriptions !== null ? Math.round((subscriptionCount / plan.maxPodcastSubscriptions) * 100) : 0,
    },
    maxDurationMinutes: plan.maxDurationMinutes,
    pastEpisodesLimit: plan.pastEpisodesLimit ?? null,
    publicSharing: plan.publicSharing ?? false,
    transcriptAccess: plan.transcriptAccess ?? false,
    plan: { name: plan.name, slug: plan.slug },
  };
}
