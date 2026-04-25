import type { CronLogger } from "./runner";
import { getConfig } from "../config";
import { isSubscriptionInactive, pauseSubscription } from "../subscription-pause";
import type { Env } from "../../types";
import type { SubscriptionPauseEmailMessage } from "../queue-messages";

type Prisma = any;

const SUB_BATCH_SIZE = 200;

/**
 * Subscription Engagement job: detects subscriptions where the user has not
 * listened to the last N delivered episodes and auto-pauses them. Each pause
 * enqueues a one-time notification email so the user can explicitly resume.
 *
 * Distinct from `user-lifecycle`, which is account-level (free trial expiry).
 * This job is per-subscription engagement hygiene — its main motivator is
 * stopping pipeline cost (feed-refresh → distillation → narrative → clip →
 * briefing) for subscriptions no one is listening to.
 */
export async function runSubscriptionEngagementJob(
  prisma: Prisma,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  const enabled = await getConfig(prisma, "subscription.autoPauseEnabled", true);
  const n = await getConfig(prisma, "subscription.pauseInactiveEpisodes", 5);

  if (!enabled || n <= 0) {
    await logger.info(`Auto-pause disabled (enabled=${enabled}, n=${n}) — no-op`);
    return { scanned: 0, paused: 0, emailsEnqueued: 0, enabled, n };
  }

  await logger.info(`Scanning active subscriptions for ${n}-episode inactivity`);

  const candidates = await prisma.subscription.findMany({
    where: { pausedAt: null },
    select: { id: true, userId: true, podcastId: true },
    orderBy: { updatedAt: "asc" },
    take: SUB_BATCH_SIZE,
  });

  let scanned = 0;
  let paused = 0;
  let emailsEnqueued = 0;
  let emailsFailed = 0;

  for (const sub of candidates) {
    scanned++;
    try {
      const { inactive, deliveredCount } = await isSubscriptionInactive(prisma, {
        userId: sub.userId,
        podcastId: sub.podcastId,
        n,
      });
      if (!inactive) continue;

      const result = await pauseSubscription(prisma, env, {
        subscriptionId: sub.id,
        reason: `inactivity:${n}_episodes`,
      });
      if (!result) continue;
      paused++;

      await logger.info(`Paused subscription ${sub.id} after ${deliveredCount} unlistened episodes`, {
        subscriptionId: sub.id,
        userId: sub.userId,
        podcastId: sub.podcastId,
        deliveredCount,
      });

      try {
        const message: SubscriptionPauseEmailMessage = {
          subscriptionId: sub.id,
          userId: sub.userId,
          podcastId: sub.podcastId,
          resumeToken: result.resumeToken,
          episodesUnlistened: deliveredCount,
          reason: `inactivity:${n}_episodes`,
        };
        await env.SUBSCRIPTION_PAUSE_EMAIL_QUEUE.send(message);
        emailsEnqueued++;
      } catch (err) {
        emailsFailed++;
        await logger.error(`Failed to enqueue pause email for ${sub.id}`, {
          subscriptionId: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (err) {
      await logger.error(`Error processing subscription ${sub.id}`, {
        subscriptionId: sub.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logger.info(`Scan complete: scanned=${scanned} paused=${paused} emailsEnqueued=${emailsEnqueued} emailsFailed=${emailsFailed}`);

  return { scanned, paused, emailsEnqueued, emailsFailed, n };
}
