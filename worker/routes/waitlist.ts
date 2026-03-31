import { Hono } from "hono";
import type { Env } from "../types";

/**
 * Public waitlist API routes.
 * Uses RATE_LIMIT_KV for storage (no DB dependency).
 * Mounted at /api/waitlist — no Clerk auth required.
 */
const waitlist = new Hono<{ Bindings: Env }>();

waitlist.post("/", async (c) => {
  const body = (await c.req.json<{ email?: string }>().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 320) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const kv = c.env.RATE_LIMIT_KV;
  if (!kv) {
    return c.json({ error: "Waitlist unavailable" }, 503);
  }

  // Check duplicate
  const existing = await kv.get(`waitlist:${email}`);
  if (existing) {
    return c.json({ error: "Already on the waitlist" }, 409);
  }

  // Store signup
  const signup = {
    email,
    timestamp: new Date().toISOString(),
    source: c.req.header("referer") || "direct",
  };
  await kv.put(`waitlist:${email}`, JSON.stringify(signup));

  // Append to ordered list (KV doesn't have lists, so use a counter)
  const countStr = await kv.get("waitlist:_count");
  const count = countStr ? parseInt(countStr, 10) : 0;
  await kv.put(`waitlist:entry:${count}`, JSON.stringify(signup));
  await kv.put("waitlist:_count", String(count + 1));

  // Send confirmation email via Resend
  if (c.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: c.env.FROM_EMAIL || "PodBlipp <hello@podblipp.com>",
          to: email,
          subject: "You're on the PodBlipp waitlist!",
          html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">Welcome to PodBlipp</h1>
            <p>You're on the list. We'll let you know when it's your turn to get every podcast on your pace.</p>
            <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">— The PodBlipp team</p>
          </div>`,
        }),
      });
    } catch (e) {
      console.error("Email send failed:", e);
    }
  }

  return c.json({ ok: true });
});

/** Admin export endpoint — token-protected */
waitlist.get("/export", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const kv = c.env.RATE_LIMIT_KV;
  if (!kv) {
    return c.json({ error: "Waitlist unavailable" }, 503);
  }

  const countStr = await kv.get("waitlist:_count");
  const count = countStr ? parseInt(countStr, 10) : 0;

  const signups: any[] = [];
  for (let i = 0; i < count; i++) {
    const entry = await kv.get(`waitlist:entry:${i}`);
    if (entry) {
      signups.push(JSON.parse(entry));
    }
  }

  return c.json({ count: signups.length, signups });
});

export { waitlist };
