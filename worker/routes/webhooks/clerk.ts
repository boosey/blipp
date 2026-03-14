import { Hono } from "hono";
import type { Env } from "../../types";
import { verifyWebhook } from "@clerk/backend/webhooks";
import type { WebhookEvent } from "@clerk/backend/webhooks";

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
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(c.req.raw, {
      signingSecret: c.env.CLERK_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  const prisma = c.get("prisma") as any;

  switch (event.type) {
    case "user.created": {
      const d = event.data;
      const email =
        d.email_addresses?.[0]?.email_address ?? `${d.id}@unknown.com`;
      await prisma.user.create({
        data: {
          clerkId: d.id,
          email,
          name:
            [d.first_name, d.last_name].filter(Boolean).join(" ") ||
            null,
          imageUrl: d.image_url ?? null,
        },
      });
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
