import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

export { clerkMiddleware, getAuth };

/**
 * Middleware that requires a valid Clerk session.
 * Returns 401 JSON response if no authenticated user is found.
 *
 * @returns Hono middleware that gates routes behind Clerk authentication
 */
export const requireAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const auth = getAuth(c);
    if (!auth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  }
);
