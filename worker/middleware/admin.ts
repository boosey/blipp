import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { Env } from "../types";

/**
 * Middleware that requires the authenticated user to be an admin.
 * Must be used after clerkMiddleware and prismaMiddleware.
 * Returns 401 if not authenticated, 403 if not an admin.
 */
export const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    // Allow server-to-server auth via Bearer CLERK_SECRET_KEY (scripts, CI)
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token === c.env.CLERK_SECRET_KEY) {
        await next();
        return;
      }
    }

    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const prisma = c.get("prisma") as any;
    const user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  }
);
