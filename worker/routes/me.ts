import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

export const me = new Hono<{ Bindings: Env }>();

me.use("*", requireAuth);

/**
 * GET / — Return the current user's DB record, creating it if needed.
 * Called on app load to ensure the user exists in the database.
 */
me.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      tier: user.tier,
      isAdmin: user.isAdmin,
    },
  });
});
