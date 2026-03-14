import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

/**
 * API key authentication middleware.
 * Checks for Authorization: Bearer blp_live_... header.
 * Falls through to Clerk auth if no API key present.
 */
export const apiKeyAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer blp_live_")) {
      // Not an API key — fall through to Clerk auth
      await next();
      return;
    }

    const key = authHeader.slice(7); // Remove "Bearer "
    const prisma = c.get("prisma") as any;

    // Hash the key to look up
    const keyBytes = new TextEncoder().encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    if (apiKey.revokedAt) {
      return c.json({ error: "API key has been revoked" }, 401);
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return c.json({ error: "API key has expired" }, 401);
    }

    // Update lastUsedAt (fire-and-forget)
    c.executionCtx.waitUntil(
      prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {})
    );

    // Store scopes in context for downstream authorization
    c.set("apiKeyScopes", apiKey.scopes);
    c.set("apiKeyUserId", apiKey.userId);

    await next();
  }
);
