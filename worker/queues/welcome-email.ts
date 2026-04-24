import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { resolveApiKey } from "../lib/service-key-resolver";
import { sendTemplateEmail } from "../lib/zeptomail";
import type { WelcomeEmailMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for the one-time welcome email.
 *
 * Enqueued from the Clerk user.created webhook (worker/routes/webhooks/clerk.ts).
 * Idempotent: skips users whose welcomeEmailSentAt is already set, so replayed
 * webhooks and queue retries are safe.
 *
 * Failures are classified by the ZeptoMail client:
 *  - permanent (400/401/403/422): ack and move on — human config fix needed.
 *  - transient (network, 5xx, other): msg.retry() for CF backoff.
 */
export async function handleWelcomeEmail(
  batch: MessageBatch<WelcomeEmailMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const enabled = await getConfig(prisma, "welcomeEmail.enabled", true);
    if (!enabled) {
      console.log(JSON.stringify({
        level: "info",
        action: "welcome_email_disabled",
        messageCount: batch.messages.length,
        ts: new Date().toISOString(),
      }));
      for (const msg of batch.messages) msg.ack();
      return;
    }

    // Resolve ZeptoMail secrets once per batch. resolveApiKey does DB lookup
    // first (Admin > Service Keys) then falls back to the Cloudflare Worker secret.
    const token = await resolveApiKey(prisma, env, "ZEPTOMAIL_TOKEN", "email.welcome");
    const fromAddress = env.ZEPTOMAIL_FROM_ADDRESS;
    const fromName = env.ZEPTOMAIL_FROM_NAME;
    const templateKey = env.ZEPTOMAIL_WELCOME_TEMPLATE_KEY;

    if (!token || !fromAddress || !fromName || !templateKey) {
      console.error(JSON.stringify({
        level: "error",
        action: "welcome_email_misconfigured",
        hasToken: Boolean(token),
        hasFromAddress: Boolean(fromAddress),
        hasFromName: Boolean(fromName),
        hasTemplateKey: Boolean(templateKey),
        ts: new Date().toISOString(),
      }));
      // Missing config is permanent — ack so we don't spin. Alarm on the log.
      for (const msg of batch.messages) msg.ack();
      return;
    }

    for (const msg of batch.messages) {
      const { userId } = msg.body;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, welcomeEmailSentAt: true },
        });

        if (!user) {
          console.warn(JSON.stringify({
            level: "warn",
            action: "welcome_email_user_missing",
            userId,
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        if (user.welcomeEmailSentAt) {
          console.log(JSON.stringify({
            level: "info",
            action: "welcome_email_skipped_already_sent",
            userId,
            sentAt: user.welcomeEmailSentAt.toISOString(),
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        const firstName = user.name?.split(/\s+/)[0] || "there";
        const fullName = user.name || user.email.split("@")[0];

        const result = await sendTemplateEmail({
          token,
          templateKey,
          fromAddress,
          fromName,
          toAddress: user.email,
          toName: user.name,
          mergeInfo: {
            first_name: firstName,
            full_name: fullName,
            email: user.email,
            app_url: `${env.APP_ORIGIN}/home`,
          },
        });

        if (result.ok) {
          await prisma.user.update({
            where: { id: user.id },
            data: { welcomeEmailSentAt: new Date() },
          });
          console.log(JSON.stringify({
            level: "info",
            action: "welcome_email_sent",
            userId,
            email: user.email,
            ts: new Date().toISOString(),
          }));
          msg.ack();
          continue;
        }

        console.error(JSON.stringify({
          level: "error",
          action: "welcome_email_send_failed",
          userId,
          status: result.status,
          permanent: result.permanent,
          body: result.body,
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
          action: "welcome_email_unexpected_error",
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
