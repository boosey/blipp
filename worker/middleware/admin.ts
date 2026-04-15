import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { Env } from "../types";
import { resolveApiKey } from "../lib/service-key-resolver";

/**
 * Fine-grained api-key scopes that permit access to specific admin routes
 * without granting blanket admin:write. Keep this list small and explicit.
 */
const FINE_GRAINED_ROUTE_SCOPES: Array<{
  method: string;
  pattern: RegExp;
  scope: string;
}> = [
  {
    method: "POST",
    pattern: /^\/api\/admin\/users\/[^/]+\/mark-welcomed$/,
    scope: "users:welcome",
  },
];

/**
 * Middleware that requires the authenticated user to be an admin.
 * Must be used after clerkMiddleware, prismaMiddleware, and apiKeyAuth.
 * Returns 401 if not authenticated, 403 if not authorized.
 */
export const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    // Allow server-to-server auth via Bearer CLERK_SECRET_KEY (Clerk internal).
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const clerkSecret = await resolveApiKey(c.get("prisma") as any, c.env, "CLERK_SECRET_KEY", "auth.clerk");
      if (token === clerkSecret) {
        await next();
        return;
      }
    }

    // API key auth (set by apiKeyAuth middleware).
    const apiKeyScopes = c.get("apiKeyScopes") as string[] | undefined;
    if (apiKeyScopes) {
      const method = c.req.method;
      const isRead = method === "GET" || method === "OPTIONS" || method === "HEAD";

      if (apiKeyScopes.includes("admin:write")) {
        await next();
        return;
      }
      if (isRead && apiKeyScopes.includes("admin:read")) {
        await next();
        return;
      }

      // Fine-grained per-route scope check
      const path = c.req.path;
      const match = FINE_GRAINED_ROUTE_SCOPES.find(
        (r) => r.method === method && r.pattern.test(path)
      );
      if (match && apiKeyScopes.includes(match.scope)) {
        await next();
        return;
      }

      return c.json({ error: "Insufficient scope" }, 403);
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
