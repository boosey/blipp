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
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { plan: true },
  });
  return c.json({
    user: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      imageUrl: fullUser.imageUrl,
      plan: {
        id: fullUser.plan.id,
        name: fullUser.plan.name,
        slug: fullUser.plan.slug,
      },
      isAdmin: fullUser.isAdmin,
    },
  });
});
