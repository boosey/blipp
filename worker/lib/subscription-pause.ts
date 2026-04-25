/**
 * Helpers for the subscription auto-pause feature.
 *
 * Used by:
 * - worker/lib/cron/subscription-engagement.ts (the cron job)
 * - worker/queues/subscription-pause-email.ts (notification consumer)
 * - worker/routes/podcasts.ts (manual pause/resume)
 * - worker/routes/subscription-resume.ts (token-link resume from email)
 */

type Prisma = any;

const TOKEN_VERSION = "v1";

/** Subset of Env fields needed by token signing. */
export interface ResumeTokenEnv {
  SUBSCRIPTION_RESUME_SECRET?: string;
  CLERK_WEBHOOK_SECRET?: string;
}

/**
 * Returns true if the subscription has had its last `n` delivered (READY) FeedItems
 * all unlistened, AND has at least `n` total READY FeedItems. Returns false otherwise
 * (including the brand-new-subscription case where there isn't enough history).
 */
export async function isSubscriptionInactive(
  prisma: Prisma,
  args: { userId: string; podcastId: string; n: number }
): Promise<{ inactive: boolean; deliveredCount: number }> {
  const { userId, podcastId, n } = args;
  if (n <= 0) return { inactive: false, deliveredCount: 0 };

  const recent = await prisma.feedItem.findMany({
    where: {
      userId,
      podcastId,
      source: "SUBSCRIPTION",
      status: "READY",
    },
    orderBy: { episode: { publishedAt: "desc" } },
    take: n,
    select: { listened: true },
  });

  if (recent.length < n) return { inactive: false, deliveredCount: recent.length };
  const inactive = recent.every((fi: { listened: boolean }) => !fi.listened);
  return { inactive, deliveredCount: recent.length };
}

/**
 * Atomically pauses a subscription. Only sets `pausedAt` if currently null
 * (so racing cron passes can't double-pause / double-email). Also marks any
 * in-flight FeedItems for that (userId, podcastId) — PENDING or PROCESSING —
 * as CANCELLED so the user does not receive content from a paused sub even
 * if the pipeline was already running.
 *
 * Returns null if the row was already paused (no work to do).
 * Returns the row info if a transition happened.
 */
export async function pauseSubscription(
  prisma: Prisma,
  env: ResumeTokenEnv,
  args: { subscriptionId: string; reason: string }
): Promise<{ id: string; userId: string; podcastId: string; resumeToken: string } | null> {
  const { subscriptionId, reason } = args;

  const resumeToken = await generateResumeToken(env, subscriptionId);

  const result = await prisma.subscription.updateMany({
    where: { id: subscriptionId, pausedAt: null },
    data: {
      pausedAt: new Date(),
      pauseReason: reason,
      resumeToken,
    },
  });

  if (result.count === 0) return null;

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, userId: true, podcastId: true, resumeToken: true },
  });
  if (!sub) return null;

  await prisma.feedItem.updateMany({
    where: {
      userId: sub.userId,
      podcastId: sub.podcastId,
      source: "SUBSCRIPTION",
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: "CANCELLED",
      errorMessage: "Subscription paused — work cancelled",
    },
  });

  return {
    id: sub.id,
    userId: sub.userId,
    podcastId: sub.podcastId,
    resumeToken: sub.resumeToken!,
  };
}

/**
 * Resumes a paused subscription. Clears pausedAt, pauseReason, resumeToken.
 * Idempotent — returns false if the row was already unpaused.
 */
export async function resumeSubscription(
  prisma: Prisma,
  subscriptionId: string
): Promise<boolean> {
  const result = await prisma.subscription.updateMany({
    where: { id: subscriptionId, pausedAt: { not: null } },
    data: {
      pausedAt: null,
      pauseReason: null,
      resumeToken: null,
    },
  });
  return result.count > 0;
}

// ── Resume token (HMAC-signed) ──────────────────────────────────────────────

/** Token format: v1.<subscriptionId>.<issuedAtMs>.<base64urlHmac> */
export async function generateResumeToken(
  env: ResumeTokenEnv,
  subscriptionId: string
): Promise<string> {
  const issuedAt = Date.now().toString();
  const payload = `${TOKEN_VERSION}.${subscriptionId}.${issuedAt}`;
  const sig = await sign(env, payload);
  return `${payload}.${sig}`;
}

export async function verifyResumeToken(
  env: ResumeTokenEnv,
  token: string
): Promise<{ subscriptionId: string; issuedAt: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, subscriptionId, issuedAtStr, sig] = parts;
  if (version !== TOKEN_VERSION) return null;
  const issuedAt = Number.parseInt(issuedAtStr, 10);
  if (!Number.isFinite(issuedAt)) return null;

  const payload = `${version}.${subscriptionId}.${issuedAtStr}`;
  const expected = await sign(env, payload);
  if (!constantTimeEq(sig, expected)) return null;
  return { subscriptionId, issuedAt };
}

/**
 * Resolve the signing secret from env bindings.
 *
 * Prefers `SUBSCRIPTION_RESUME_SECRET`. Falls back to a derivation off
 * `CLERK_WEBHOOK_SECRET` so we don't require a new secret to manage at
 * rollout — the resume link is low-impact (worst case: someone resumes
 * a sub the user already paused; the user can pause again).
 */
function getSecret(env: ResumeTokenEnv): string {
  if (env.SUBSCRIPTION_RESUME_SECRET) return env.SUBSCRIPTION_RESUME_SECRET;
  if (env.CLERK_WEBHOOK_SECRET) return `subscription-resume:${env.CLERK_WEBHOOK_SECRET}`;
  return "subscription-resume:default-dev-secret";
}

async function sign(env: ResumeTokenEnv, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return base64UrlEncode(new Uint8Array(buf));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
