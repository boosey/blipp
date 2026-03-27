import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { Env } from "../types";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  /** Path prefixes to skip (e.g. ["/api/webhooks/", "/api/health"]) */
  skipPaths?: string[];
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

    const auth = getAuth(c);
    const identifier =
      auth?.userId ?? c.req.header("cf-connecting-ip") ?? "unknown";
    const bucket = Math.floor(Date.now() / config.windowMs);
    const key = `${config.keyPrefix}:${identifier}:${bucket}`;

    const val = await kv.get(key);
    const current = val ? parseInt(val, 10) : 0;

    if (current >= config.maxRequests) {
      const resetAt = (bucket + 1) * config.windowMs;
      const now = Date.now();
      return c.json({ error: "Rate limit exceeded" }, 429, {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": String(Math.ceil((resetAt - now) / 1000)),
      } as any);
    }

    const newCount = current + 1;
    const ttlSeconds = Math.ceil(config.windowMs / 1000) + 60;
    c.executionCtx.waitUntil(
      kv.put(key, String(newCount), { expirationTtl: ttlSeconds })
    );

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(0, config.maxRequests - newCount))
    );

    await next();
  });
}
