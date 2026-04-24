import { Hono } from "hono";
import type { Env } from "../../types";
import { verifyWebhook } from "@clerk/backend/webhooks";
import type { WebhookEvent } from "@clerk/backend/webhooks";
import { resolveApiKey } from "../../lib/service-key-resolver";

/**
 * Clerk webhook route handler.
 * Processes user lifecycle events from Clerk and syncs them to the database.
 *
 * Handles:
 * - `user.created` — Creates a new User record
 * - `user.updated` — Updates email, name, and imageUrl
 * - `user.deleted` — Deletes the User record
 */
export const clerkWebhooks = new Hono<{ Bindings: Env }>();

clerkWebhooks.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  let event: WebhookEvent;
  try {
    const clerkWebhookSecret = await resolveApiKey(prisma, c.env, "CLERK_WEBHOOK_SECRET", "auth.clerk-webhook");
    event = await verifyWebhook(c.req.raw, {
      signingSecret: clerkWebhookSecret,
    });
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  switch (event.type) {
    case "user.created": {
      const d = event.data;
      const email =
        d.email_addresses?.[0]?.email_address ?? `${d.id}@unknown.com`;
      const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
      if (!defaultPlan) {
        console.error("No default plan configured — cannot create user");
        return c.json({ error: "No default plan" }, 500);
      }
      const created = await prisma.user.create({
        data: {
          clerkId: d.id,
          email,
          name:
            [d.first_name, d.last_name].filter(Boolean).join(" ") ||
            null,
          imageUrl: d.image_url ?? null,
          planId: defaultPlan.id,
        },
      });

      // Fire-and-forget: enqueue the welcome email. If the queue send fails
      // we'd rather log and return 2xx than have Clerk retry the whole webhook,
      // which would 409 on the duplicate user row.
      try {
        await c.env.WELCOME_EMAIL_QUEUE.send({ userId: created.id });
      } catch (sendErr) {
        console.error(JSON.stringify({
          level: "error",
          action: "welcome_email_enqueue_failed",
          userId: created.id,
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          ts: new Date().toISOString(),
        }));
      }
      break;
    }

    case "user.updated": {
      const d = event.data;
      const email =
        d.email_addresses?.[0]?.email_address ?? undefined;
      await prisma.user.update({
        where: { clerkId: d.id },
        data: {
          ...(email && { email }),
          name:
            [d.first_name, d.last_name].filter(Boolean).join(" ") ||
            null,
          imageUrl: d.image_url ?? null,
        },
      });
      break;
    }

    case "user.deleted": {
      await prisma.user.delete({
        where: { clerkId: event.data.id },
      });
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});
