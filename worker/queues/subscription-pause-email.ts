import { createPrismaClient } from "../lib/db";
import { resolveApiKey } from "../lib/service-key-resolver";
import { sendTemplateEmail } from "../lib/zeptomail";
import type { SubscriptionPauseEmailMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for the subscription-paused notification email.
 *
 * Enqueued from the subscription-engagement cron when a sub auto-pauses.
 * Idempotent: re-checks the Subscription state and skips if the row is no
 * longer paused (user resumed before email could send) or if the resumeToken
 * has changed.
 *
 * Failures are classified by the ZeptoMail client:
 *   - permanent (400/401/403/422): ack and move on — human config fix needed.
 *   - transient (network, 5xx, other): msg.retry() for CF backoff.
 */
export async function handleSubscriptionPauseEmail(
  batch: MessageBatch<SubscriptionPauseEmailMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const token = await resolveApiKey(prisma, env, "ZEPTOMAIL_TOKEN", "email.subscription_pause");
    const fromAddress = env.ZEPTOMAIL_FROM_ADDRESS;
    const fromName = env.ZEPTOMAIL_FROM_NAME;
    const templateKey = env.ZEPTOMAIL_SUBSCRIPTION_PAUSE_TEMPLATE_KEY;

    if (!token || !fromAddress || !fromName || !templateKey) {
      console.error(JSON.stringify({
        level: "error",
        action: "subscription_pause_email_misconfigured",
        hasToken: Boolean(token),
        hasFromAddress: Boolean(fromAddress),
        hasFromName: Boolean(fromName),
        hasTemplateKey: Boolean(templateKey),
        ts: new Date().toISOString(),
      }));
      for (const msg of batch.messages) msg.ack();
      return;
    }

    for (const msg of batch.messages) {
      const { subscriptionId, userId, podcastId, resumeToken, episodesUnlistened } = msg.body;
      try {
        const [sub, user, podcast] = await Promise.all([
          prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: { id: true, pausedAt: true, resumeToken: true },
          }),
          prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true },
          }),
          prisma.podcast.findUnique({
            where: { id: podcastId },
            select: { title: true },
          }),
        ]);

        if (!sub || !sub.pausedAt) {
          console.log(JSON.stringify({
            level: "info",
            action: "subscription_pause_email_skipped_resumed",
            subscriptionId,
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        if (sub.resumeToken !== resumeToken) {
          // Sub was re-paused with a fresh token; stale message, drop.
          console.log(JSON.stringify({
            level: "info",
            action: "subscription_pause_email_stale_token",
            subscriptionId,
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        if (!user || !podcast) {
          console.warn(JSON.stringify({
            level: "warn",
            action: "subscription_pause_email_missing_relation",
            subscriptionId,
            hasUser: Boolean(user),
            hasPodcast: Boolean(podcast),
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        const firstName = user.name?.split(/\s+/)[0] || "there";
        const resumeUrl = `${env.APP_ORIGIN}/api/subscriptions/resume?token=${encodeURIComponent(resumeToken)}`;
        const manageUrl = `${env.APP_ORIGIN}/subscriptions`;

        const result = await sendTemplateEmail({
          token,
          templateKey,
          fromAddress,
          fromName,
          toAddress: user.email,
          toName: user.name,
          mergeInfo: {
            first_name: firstName,
            podcast_title: podcast.title ?? "your podcast",
            episodes_unlistened: String(episodesUnlistened),
            resume_url: resumeUrl,
            manage_subscriptions_url: manageUrl,
          },
        });

        if (result.ok) {
          console.log(JSON.stringify({
            level: "info",
            action: "subscription_pause_email_sent",
            subscriptionId,
            userId,
            email: user.email,
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        console.error(JSON.stringify({
          level: "error",
          action: "subscription_pause_email_send_failed",
          subscriptionId,
          userId,
          status: result.status,
          permanent: result.permanent,
          body: (result as any).body,
          ts: new Date().toISOString(),
        }));

        if (result.permanent) {
          msg.ack();
        } else {
          msg.retry();
        }
      } catch (err) {
        console.error(JSON.stringify({
          level: "error",
          action: "subscription_pause_email_unexpected_error",
          subscriptionId,
          userId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          ts: new Date().toISOString(),
        }));
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
