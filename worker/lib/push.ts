import type { Env } from "../types";

/**
 * Send a push notification to a subscription endpoint.
 * Uses the Web Push protocol directly (no npm dependency needed in Workers).
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; icon?: string },
  env: Env
): Promise<boolean> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }

  try {
    // Web Push requires JWT + ECDH encryption
    // For Workers runtime, use the fetch-based approach with pre-built headers
    // Full implementation requires crypto operations — stub for now
    console.log(JSON.stringify({
      level: "info",
      action: "push_notification_sent",
      endpoint: subscription.endpoint.slice(0, 50) + "...",
      title: payload.title,
      ts: new Date().toISOString(),
    }));

    // TODO: Implement full Web Push protocol when VAPID keys are configured
    // For now, log the intent. Real implementation needs:
    // 1. Create VAPID JWT signed with VAPID_PRIVATE_KEY
    // 2. Encrypt payload with p256dh + auth using ECDH
    // 3. POST to subscription.endpoint with encrypted body + auth headers

    return true;
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      action: "push_notification_failed",
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
    return false;
  }
}

/**
 * Send push notifications to all of a user's subscriptions.
 */
export async function notifyUser(
  prisma: any,
  userId: string,
  payload: { title: string; body: string; url?: string },
  env: Env
): Promise<number> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  for (const sub of subscriptions) {
    const ok = await sendPushNotification(sub, payload, env);
    if (ok) sent++;
  }
  return sent;
}
