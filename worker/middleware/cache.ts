import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

interface CacheConfig {
  maxAge: number; // seconds
  staleWhileRevalidate?: number;
}

/**
 * Cache middleware using Cloudflare Cache API.
 * Only caches GET requests. Authenticated requests are cached per-user.
 */
export function cacheResponse(config: CacheConfig) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    if (c.req.method !== "GET") {
      await next();
      return;
    }

    // Build cache key (include auth for user-specific caches)
    const url = new URL(c.req.url);
    const auth = c.req.header("authorization");
    const cacheKey = auth
      ? `${url.pathname}${url.search}:${auth.slice(-16)}`
      : `${url.pathname}${url.search}`;

    // Try cache (caches.default is a Cloudflare Workers API)
    const cache = (caches as any).default as Cache;
    const cacheRequest = new Request(new URL(cacheKey, url.origin));
    const cached = await cache.match(cacheRequest);

    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    await next();

    // Only cache successful responses
    if (c.res.status === 200) {
      const response = c.res.clone();
      response.headers.set(
        "Cache-Control",
        `public, max-age=${config.maxAge}${
          config.staleWhileRevalidate
            ? `, stale-while-revalidate=${config.staleWhileRevalidate}`
            : ""
        }`
      );
      response.headers.set("X-Cache", "MISS");

      c.executionCtx.waitUntil(cache.put(cacheRequest, response));
    }
  });
}
