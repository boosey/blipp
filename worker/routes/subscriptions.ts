import { Hono } from "hono";
import type { Env } from "../types";
import { resumeSubscription, verifyResumeToken } from "../lib/subscription-pause";

/**
 * Public subscription routes.
 *
 * GET /resume?token=... — token-link resume from the auto-paused email. Does not
 * require Clerk auth (the email link is opened from a mail client). The HMAC
 * token + DB token-match check authenticate the action.
 */
export const subscriptions = new Hono<{ Bindings: Env }>();

subscriptions.get("/resume", async (c) => {
  const token = c.req.query("token") ?? "";
  const appOrigin = (c.env.APP_ORIGIN ?? "").replace(/\/$/, "");

  const verified = await verifyResumeToken(c.env, token);
  if (!verified) {
    return c.redirect(`${appOrigin}/library?tab=subscriptions&resumeError=1`);
  }

  const prisma = c.get("prisma") as any;
  const sub = await prisma.subscription.findUnique({
    where: { id: verified.subscriptionId },
    select: { id: true, resumeToken: true, podcast: { select: { title: true } } },
  });

  // Token must match the *current* token on the row — old tokens are dead.
  if (!sub || sub.resumeToken !== token) {
    return c.redirect(`${appOrigin}/library?tab=subscriptions&resumeError=1`);
  }

  await resumeSubscription(prisma, sub.id);
  const titleParam = encodeURIComponent(sub.podcast?.title ?? "");
  return c.redirect(`${appOrigin}/library?tab=subscriptions&resumed=${titleParam}`);
});
