import type { Env } from "../types";
import { resolveApiKey } from "./service-key-resolver";

/**
 * Send a push notification using the Web Push protocol.
 * Implements VAPID authentication using Web Crypto API (available in Workers).
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; icon?: string },
  env: Env,
  prisma?: any
): Promise<boolean> {
  const vapidPublicKey = await resolveApiKey(prisma, env, "VAPID_PUBLIC_KEY", "push.vapid");
  const vapidPrivateKey = await resolveApiKey(prisma, env, "VAPID_PRIVATE_KEY", "push.vapid");
  if (!vapidPublicKey || !vapidPrivateKey || !env.VAPID_SUBJECT) {
    return false;
  }

  try {
    const payloadText = JSON.stringify(payload);

    // Create VAPID JWT for authorization
    const audience = new URL(subscription.endpoint).origin;
    const vapidToken = await createVapidJwt(
      audience,
      env.VAPID_SUBJECT,
      vapidPrivateKey
    );

    // Send push message
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${vapidToken}, k=${vapidPublicKey}`,
        "Content-Type": "application/json",
        "TTL": "86400",
        "Urgency": "normal",
      },
      body: payloadText,
    });

    if (response.status === 201) {
      return true;
    }

    if (response.status === 410 || response.status === 404) {
      // Subscription expired — should be removed from DB
      console.log(JSON.stringify({
        level: "info",
        action: "push_subscription_expired",
        endpoint: subscription.endpoint.slice(0, 50),
        ts: new Date().toISOString(),
      }));
      return false;
    }

    console.error(JSON.stringify({
      level: "error",
      action: "push_send_failed",
      status: response.status,
      body: await response.text().catch(() => ""),
      ts: new Date().toISOString(),
    }));
    return false;
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
 * Create a VAPID JWT for Web Push authorization.
 * Uses Web Crypto API (available in Cloudflare Workers).
 */
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600, // 12 hours
    sub: subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const claimsB64 = base64urlEncode(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;

  // Import the private key
  const keyData = base64urlDecode(privateKeyBase64);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );

  const signatureB64 = base64urlEncode(new Uint8Array(signature));
  return `${unsigned}.${signatureB64}`;
}

function base64urlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Send push notifications to all of a user's subscriptions.
 * Cleans up expired/invalid subscriptions automatically.
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
    if (ok) {
      sent++;
    } else {
      // Clean up expired/invalid subscriptions
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
  }
  return sent;
}
