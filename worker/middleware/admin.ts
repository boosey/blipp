import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

/**
 * Middleware that requires the authenticated user to be an admin.
 * Must be used after clerkMiddleware (which populates auth context).
 * Returns 401 if not authenticated, 403 if not an admin.
 */
export const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const prisma = createPrismaClient(c.env.HYPERDRIVE);
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: auth.userId },
        select: { isAdmin: true },
      });
      if (!user?.isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }
      await next();
    } finally {
      c.executionCtx.waitUntil(prisma.$disconnect());
    }
  }
);
