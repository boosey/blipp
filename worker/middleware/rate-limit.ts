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

// In-memory counter store (per-isolate, resets on redeploy).
// Suitable for dev; production should use KV or Durable Objects.
const counters = new Map<string, { count: number; expiresAt: number }>();

export function rateLimit(config: RateLimitConfig) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    // Skip exempt paths (webhooks, health checks, etc.)
    if (config.skipPaths?.some((prefix) => c.req.path.startsWith(prefix))) {
      return next();
    }

    const auth = getAuth(c);
    const identifier =
      auth?.userId ?? c.req.header("cf-connecting-ip") ?? "unknown";
    const bucket = Math.floor(Date.now() / config.windowMs);
    const key = `${config.keyPrefix}:${identifier}:${bucket}`;

    const now = Date.now();
    const entry = counters.get(key);
    const current = entry && entry.expiresAt > now ? entry.count : 0;

    if (current >= config.maxRequests) {
      const resetAt = (bucket + 1) * config.windowMs;
      return c.json({ error: "Rate limit exceeded" }, 429, {
        "X-RateLimit-Limit": String(config.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": String(Math.ceil((resetAt - now) / 1000)),
      } as any);
    }

    counters.set(key, {
      count: current + 1,
      expiresAt: now + config.windowMs + 60_000,
    });

    // Clean stale entries periodically (~1% of requests)
    if (Math.random() < 0.01) {
      for (const [k, v] of counters) {
        if (v.expiresAt < now) counters.delete(k);
      }
    }

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(0, config.maxRequests - current - 1))
    );

    await next();
  });
}
