import { Hono } from "hono";
import type { Env } from "../../types";

const invitesRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/admin/invites/send
 * Send invite emails in batches via Resend.
 * Body: { emails: string[], batchSize?: number }
 */
invitesRoutes.post("/send", async (c) => {
  const body = await c.req.json<{ emails?: string[]; batchSize?: number }>().catch(() => ({}));
  const { emails, batchSize = 10 } = body as { emails?: string[]; batchSize?: number };

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return c.json({ error: "emails array is required" }, 400);
  }

  const kv = c.env.RATE_LIMIT_KV;
  if (!kv) {
    return c.json({ error: "KV storage unavailable" }, 503);
  }

  if (!c.env.RESEND_API_KEY) {
    return c.json({ error: "RESEND_API_KEY not configured" }, 503);
  }

  const fromEmail = c.env.FROM_EMAIL || "Blipp <hello@podblipp.com>";
  const results: { sent: string[]; skipped: string[]; failed: string[] } = {
    sent: [],
    skipped: [],
    failed: [],
  };

  // Process in batches
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (rawEmail) => {
        const email = rawEmail.trim().toLowerCase();

        if (!email || !email.includes("@") || email.length > 320) {
          results.failed.push(email || rawEmail);
          return;
        }

        // Check if already sent
        const alreadySent = await kv.get(`invite:sent:${email}`);
        if (alreadySent) {
          results.skipped.push(email);
          return;
        }

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: email,
              subject: "You're invited to try Blipp — podcasts on your pace",
              html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
  <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">You're invited to Blipp</h1>
  <p>You're one of the first people we're inviting to try <strong>Blipp</strong> — a new way to keep up with podcasts when you're short on time.</p>
  <p>Blipp turns full podcast episodes into short, voice-narrated summaries (2–30 min). Subscribe to your favorite shows and get a fresh Blipp whenever a new episode drops. Hear something great? Tap through to the full original.</p>
  <p style="margin: 1.5rem 0;"><a href="https://podblipp.com" style="background: #6366f1; color: #fff; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">Get Started</a></p>
  <p>We'd love your honest feedback — what works, what doesn't, what's confusing. Reply to this email or use the feedback form in the app.</p>
  <p style="color: #666; font-size: 0.875rem; margin-top: 2rem;">— The Blipp team</p>
</div>`,
            }),
          });

          if (res.ok) {
            await kv.put(
              `invite:sent:${email}`,
              JSON.stringify({ sentAt: new Date().toISOString() })
            );
            results.sent.push(email);
          } else {
            results.failed.push(email);
          }
        } catch {
          results.failed.push(email);
        }
      })
    );
  }

  return c.json({
    sent: results.sent.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    details: results,
  });
});

/**
 * GET /api/admin/invites/status
 * Check invite send status for given emails.
 * Query: ?emails=a@b.com,c@d.com
 */
invitesRoutes.get("/status", async (c) => {
  const emailsParam = c.req.query("emails");
  if (!emailsParam) {
    return c.json({ error: "emails query param required" }, 400);
  }

  const kv = c.env.RATE_LIMIT_KV;
  if (!kv) {
    return c.json({ error: "KV storage unavailable" }, 503);
  }

  const emails = emailsParam.split(",").map((e) => e.trim().toLowerCase());
  const statuses: Record<string, { sent: boolean; sentAt?: string }> = {};

  await Promise.all(
    emails.map(async (email) => {
      const data = await kv.get(`invite:sent:${email}`);
      if (data) {
        const parsed = JSON.parse(data);
        statuses[email] = { sent: true, sentAt: parsed.sentAt };
      } else {
        statuses[email] = { sent: false };
      }
    })
  );

  return c.json({ statuses });
});

export { invitesRoutes };
