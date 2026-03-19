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

// In-memory fallback (per-isolate, resets on redeploy).
// Used when KV is not configured.
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

    const kv = c.env.RATE_LIMIT_KV;
    let current: number;

    if (kv) {
      // KV-backed: persistent across isolates and redeploys
      const val = await kv.get(key);
      current = val ? parseInt(val, 10) : 0;
    } else {
      // In-memory fallback
      const now = Date.now();
      const entry = counters.get(key);
      current = entry && entry.expiresAt > now ? entry.count : 0;
    }

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

    if (kv) {
      // TTL = remaining window time + 60s buffer, in seconds
      const ttlSeconds = Math.ceil(config.windowMs / 1000) + 60;
      // Fire-and-forget the KV write to avoid blocking the request
      c.executionCtx.waitUntil(
        kv.put(key, String(newCount), { expirationTtl: ttlSeconds })
      );
    } else {
      const now = Date.now();
      counters.set(key, {
        count: newCount,
        expiresAt: now + config.windowMs + 60_000,
      });

      // Clean stale entries periodically (~1% of requests)
      if (Math.random() < 0.01) {
        for (const [k, v] of counters) {
          if (v.expiresAt < now) counters.delete(k);
        }
      }
    }

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(0, config.maxRequests - newCount))
    );

    await next();
  });
}
