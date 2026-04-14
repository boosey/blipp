import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import { getConfig } from "../lib/config";
import type { Env } from "../types";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  /** Path prefixes to skip (e.g. ["/api/webhooks/", "/api/health"]) */
  skipPaths?: string[];
  /** Optional PlatformConfig keys for dynamic overrides. Falls back to static values above. */
  configKeys?: {
    windowMs: string;
    maxRequests: string;
  };
}

export function rateLimit(config: RateLimitConfig) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    // Skip exempt paths (webhooks, health checks, etc.)
    if (config.skipPaths?.some((prefix) => c.req.path.startsWith(prefix))) {
      return next();
    }

    const kv = c.env.RATE_LIMIT_KV;
    if (!kv) {
      throw new Error("RATE_LIMIT_KV binding is required but not configured");
    }

    // Resolve dynamic config from PlatformConfig (60s cache) or fall back to static values
    let { windowMs, maxRequests } = config;
    if (config.configKeys) {
      const prisma = c.get("prisma") as any;
      if (prisma) {
        [windowMs, maxRequests] = await Promise.all([
          getConfig(prisma, config.configKeys.windowMs, config.windowMs),
          getConfig(prisma, config.configKeys.maxRequests, config.maxRequests),
        ]);
      }
    }

    // API-key auth bypasses clerkMiddleware, so getAuth would throw. Prefer the
    // api-key user id when present, otherwise fall back to Clerk auth.
    const apiKeyUserId = c.get("apiKeyUserId") as string | undefined;
    let clerkUserId: string | undefined;
    if (!apiKeyUserId) {
      try {
        clerkUserId = getAuth(c)?.userId ?? undefined;
      } catch {
        clerkUserId = undefined;
      }
    }
    const identifier =
      apiKeyUserId ?? clerkUserId ?? c.req.header("cf-connecting-ip") ?? "unknown";
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `${config.keyPrefix}:${identifier}:${bucket}`;

    const val = await kv.get(key);
    const current = val ? parseInt(val, 10) : 0;

    if (current >= maxRequests) {
      const resetAt = (bucket + 1) * windowMs;
      const now = Date.now();
      return c.json({ error: "Rate limit exceeded" }, 429, {
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": String(Math.ceil((resetAt - now) / 1000)),
      } as any);
    }

    const newCount = current + 1;
    const ttlSeconds = Math.ceil(windowMs / 1000) + 60;
    c.executionCtx.waitUntil(
      kv.put(key, String(newCount), { expirationTtl: ttlSeconds })
    );

    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(0, maxRequests - newCount))
    );

    await next();
  });
}
