import type { PrismaClient } from "./db";

/**
 * Evicts least-valuable podcasts to make room for new discoveries.
 *
 * Eviction rules (never evict if any apply):
 * - Apple-sourced (source = 'apple' OR has appleRank)
 * - Has active subscribers
 * - Has been favorited by any user
 * - Has been thumbs-up'd (vote = 1) by any user
 * - Has been blipped (FeedItem exists for any episode) in last 180 days
 * - Has been detail-viewed in last 180 days
 *
 * Eviction priority (evicted first → last):
 * 1. Unranked podcasts (no piRank — no trending signal)
 * 2. Lowest-ranked podcasts (highest piRank number = least trending)
 * 3. Oldest by discovery date as tiebreaker
 */
export async function evictToFit(
  prisma: PrismaClient,
  slotsNeeded: number,
  maxSize: number,
): Promise<{ evicted: number; shortfall: number }> {
  // Count active catalog (exclude already-evicted and pending_deletion)
  const currentCount = await prisma.podcast.count({
    where: { status: { notIn: ["pending_deletion", "evicted"] } },
  });

  const available = maxSize - currentCount;
  if (available >= slotsNeeded) {
    return { evicted: 0, shortfall: 0 };
  }

  const toEvict = slotsNeeded - available;

  // Use raw SQL for the complex NOT EXISTS subqueries
  const candidates: { id: string }[] = await (prisma as any).$queryRawUnsafe(`
    SELECT p.id FROM "Podcast" p
    WHERE
      -- Never evict Apple-sourced
      (p.source IS DISTINCT FROM 'apple')
      AND p."appleRank" IS NULL
      -- Never evict if subscribed
      AND NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."podcastId" = p.id)
      -- Never evict if favorited
      AND NOT EXISTS (SELECT 1 FROM "PodcastFavorite" f WHERE f."podcastId" = p.id)
      -- Never evict if thumbs-up'd
      AND NOT EXISTS (SELECT 1 FROM "PodcastVote" v WHERE v."podcastId" = p.id AND v.vote = 1)
      -- Never evict if blipped in last 180 days
      AND NOT EXISTS (
        SELECT 1 FROM "FeedItem" fi
        JOIN "Episode" e ON fi."episodeId" = e.id
        WHERE e."podcastId" = p.id AND fi."createdAt" > NOW() - INTERVAL '180 days'
      )
      -- Never evict if detail-viewed in last 180 days
      AND (p."lastDetailViewedAt" IS NULL OR p."lastDetailViewedAt" < NOW() - INTERVAL '180 days')
      -- Only evict active podcasts
      AND p.status = 'active'
    ORDER BY
      -- Evict unranked first (no trending signal = least known value)
      CASE WHEN p."piRank" IS NULL THEN 0 ELSE 1 END ASC,
      -- Then lowest-ranked (highest piRank number = least trending)
      p."piRank" DESC,
      -- Then oldest discovery as tiebreaker
      p."createdAt" ASC
    LIMIT $1
  `, toEvict);

  const candidateIds = candidates.map((c) => c.id);

  if (candidateIds.length > 0) {
    await prisma.podcast.updateMany({
      where: { id: { in: candidateIds } },
      data: { status: "evicted" },
    });
  }

  return {
    evicted: candidateIds.length,
    shortfall: Math.max(0, toEvict - candidateIds.length),
  };
}
