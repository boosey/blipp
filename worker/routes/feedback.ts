import { Hono } from "hono";
import type { Env } from "../types";

/**
 * Public feedback API routes.
 * Uses RATE_LIMIT_KV for storage (no DB dependency).
 * Mounted at /api/feedback — no Clerk auth required.
 */
const feedback = new Hono<{ Bindings: Env }>();

feedback.post("/", async (c) => {
  const body = (await c.req.json<{
    email?: string;
    message?: string;
    category?: string;
  }>().catch(() => ({}))) as {
    email?: string;
    message?: string;
    category?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const message = body.message?.trim();
  const category = body.category?.trim() || "general";

  if (!email || !email.includes("@") || email.length > 320) {
    return c.json({ error: "Invalid email address" }, 400);
  }
  if (!message || message.length < 5 || message.length > 5000) {
    return c.json({ error: "Message must be between 5 and 5000 characters" }, 400);
  }
  if (!["bug", "feature", "general"].includes(category)) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const kv = c.env.RATE_LIMIT_KV;
  if (!kv) {
    return c.json({ error: "Feedback unavailable" }, 503);
  }

  // Rate limit: max 5 submissions per email per hour
  const hourKey = `feedback:rate:${email}:${new Date().toISOString().slice(0, 13)}`;
  const rateStr = await kv.get(hourKey);
  const rateCount = rateStr ? parseInt(rateStr, 10) : 0;
  if (rateCount >= 5) {
    return c.json({ error: "Too many submissions. Please try again later." }, 429);
  }

  const timestamp = new Date().toISOString();
  const entry = { email, message, category, timestamp };

  await kv.put(`feedback:${timestamp}:${email}`, JSON.stringify(entry));
  await kv.put(hourKey, String(rateCount + 1), { expirationTtl: 3600 });

  return c.json({ ok: true });
});

export { feedback };
