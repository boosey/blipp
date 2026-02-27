import { Hono } from "hono";
import type { Env } from "../../types";
import { createPrismaClient } from "../../lib/db";

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

/**
 * POST / — Receive Clerk webhook events.
 * Clerk signs webhooks with svix; in production, verify with CLERK_WEBHOOK_SECRET.
 * For Phase 0, we trust the payload structure.
 */
clerkWebhooks.post("/", async (c) => {
  const body = await c.req.json();
  const eventType = body.type as string;
  const data = body.data;

  if (!eventType || !data) {
    return c.json({ error: "Invalid webhook payload" }, 400);
  }

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    switch (eventType) {
      case "user.created": {
        const email =
          data.email_addresses?.[0]?.email_address ?? `${data.id}@unknown.com`;
        await prisma.user.create({
          data: {
            clerkId: data.id,
            email,
            name:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              null,
            imageUrl: data.image_url ?? null,
          },
        });
        break;
      }

      case "user.updated": {
        const email =
          data.email_addresses?.[0]?.email_address ?? undefined;
        await prisma.user.update({
          where: { clerkId: data.id },
          data: {
            ...(email && { email }),
            name:
              [data.first_name, data.last_name].filter(Boolean).join(" ") ||
              null,
            imageUrl: data.image_url ?? null,
          },
        });
        break;
      }

      case "user.deleted": {
        await prisma.user.delete({
          where: { clerkId: data.id },
        });
        break;
      }

      default:
        // Unhandled event type — acknowledge but ignore
        break;
    }

    return c.json({ received: true });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
