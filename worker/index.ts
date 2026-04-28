/**
 * Blipp Worker entry point.
 *
 * Exports the three Cloudflare Worker handlers:
 * - `fetch` — Hono HTTP server (API routes + static assets)
 * - `queue` — Queue consumer dispatcher (feed refresh, distillation, clip gen, briefing assembly)
 * - `scheduled` — Cron trigger handler (enqueues feed refresh every 30 min)
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerkMiddleware } from "./middleware/auth";
import { prismaMiddleware } from "./middleware/prisma";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLogger } from "./middleware/request-logger";
import { classifyHttpError, type ApiErrorResponse } from "./lib/errors";
import { resolveApiKey } from "./lib/service-key-resolver";
import { routes } from "./routes/index";
import { handleClerkProxy } from "./routes/clerk-proxy";
import nativeAuthRoutes from "./routes/native-auth";
import { handleQueue, scheduled } from "./queues/index";
import { shimQueuesForLocalDev } from "./lib/local-queue";
import { apiKeyAuth } from "./middleware/api-key";
import { rateLimit } from "./middleware/rate-limit";
import { securityHeaders } from "./middleware/security-headers";
import { cacheResponse } from "./middleware/cache";
import { deepHealthCheck } from "./lib/health";
import { publicPages } from "./routes/public-pages";
import sitemap from "./routes/sitemap";
import clerkAuthProxy from "./routes/clerk-auth-proxy";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global error handler — catches all unhandled throws from routes/middleware
app.onError((err, c) => {
  const { status, message, code, details } = classifyHttpError(err);
  const requestId = c.get("requestId") ?? c.req.header("x-request-id") ?? crypto.randomUUID();

  console.error(JSON.stringify({
    level: "error",
    action: "unhandled_error",
    method: c.req.method,
    path: c.req.path,
    status,
    code,
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ts: new Date().toISOString(),
  }));

  const body: ApiErrorResponse = { error: message, requestId };
  if (code) body.code = code;
  if (details) body.details = details;

  return c.json(body, status as any);
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json({ error: "Not found", code: "ROUTE_NOT_FOUND" }, 404);
});

// Clerk FAPI proxy for Capacitor native apps — before any /api middleware
app.all("/api/__clerk/*", handleClerkProxy);

// Native auth endpoint — verifies provider tokens and creates Clerk sign-in tickets
// Must be before clerkMiddleware since it handles its own auth
app.route("/api/auth", nativeAuthRoutes);

// Request ID — must be first so all other middleware can access it
app.use("/api/*", requestIdMiddleware);

// CORS for all API routes
app.use("/api/*", cors({
  origin: (origin, c) => {
    if (!c.env.ALLOWED_ORIGINS) {
      throw new Error("ALLOWED_ORIGINS env var is required");
    }
    const allowedOrigins = c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim());
    return allowedOrigins.includes(origin) ? origin : "";
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Clerk Frontend API proxy — routes Clerk SDK requests through our domain
// so native apps (capacitor://localhost) don't hit CORS issues on clerk.podblipp.com.
// Must be before Clerk auth middleware since these are Clerk's own API calls.
app.route("/__clerk", clerkAuthProxy);

// Clerk auth middleware — populates auth context for all API routes.
// Skips Clerk entirely for server-to-server requests that authenticate via
// Bearer CLERK_SECRET_KEY or an api key (Bearer blp_live_...). The latter is
// validated downstream by apiKeyAuth.
app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Server-to-server auth bypass — try DB key first, fall back to env.
    // Must not throw here or it breaks all auth for browser users too.
    let clerkSecret: string | undefined;
    try {
      clerkSecret = await resolveApiKey(c.get("prisma") as any, c.env, "CLERK_SECRET_KEY", "auth.clerk");
    } catch {
      clerkSecret = c.env.CLERK_SECRET_KEY;
    }
    if (token === clerkSecret) {
      return next();
    }
    if (token.startsWith("blp_live_")) {
      return next();
    }
  }
  return clerkMiddleware()(c, next);
});

// Request logger — after auth so userId is available
app.use("/api/*", requestLogger);

// Prisma middleware — creates per-request PrismaClient on c.get("prisma")
app.use("/api/*", prismaMiddleware);

// API key auth — after Prisma (needs DB lookup), before routes.
// Falls through to Clerk auth if no API key header present.
app.use("/api/*", apiKeyAuth);

// Health check — no auth required (runs before route tree)
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Deep health check — no auth required, checks DB/R2/queues
app.get("/api/health/deep", async (c) => {
  const result = await deepHealthCheck(c.env);
  const status = result.status === "healthy" ? 200 : 503;
  return c.json(result, status);
});

// Rate limiting — applied after auth (uses userId) but before route tree.
// Limits are configurable via PlatformConfig (60s cache); static values are fallback defaults.
app.use(
  "/api/briefings/generate",
  rateLimit({
    windowMs: 3_600_000, maxRequests: 10, keyPrefix: "rl:generate",
    configKeys: { windowMs: "rateLimit.briefingGenerate.windowMs", maxRequests: "rateLimit.briefingGenerate.maxRequests" },
  })
);
app.use(
  "/api/voice-presets/*/preview",
  rateLimit({
    windowMs: 60_000, maxRequests: 20, keyPrefix: "rl:voice-preview",
    configKeys: { windowMs: "rateLimit.voicePreview.windowMs", maxRequests: "rateLimit.voicePreview.maxRequests" },
  })
);
app.use(
  "/api/podcasts/subscribe",
  rateLimit({
    windowMs: 60_000, maxRequests: 5, keyPrefix: "rl:subscribe",
    configKeys: { windowMs: "rateLimit.subscribe.windowMs", maxRequests: "rateLimit.subscribe.maxRequests" },
  })
);
// Scraping-attractive public endpoints get a tighter per-IP bucket on top of
// the global /api/* limit. Featured + recently-blipped are the most useful
// surfaces for harvesting the catalog, so they're throttled independently.
app.use(
  "/api/public/recommendations/featured",
  rateLimit({
    windowMs: 60_000, maxRequests: 10, keyPrefix: "rl:public-featured",
    configKeys: { windowMs: "rateLimit.publicFeatured.windowMs", maxRequests: "rateLimit.publicFeatured.maxRequests" },
  })
);
app.use(
  "/api/public/recently-blipped",
  rateLimit({
    windowMs: 60_000, maxRequests: 10, keyPrefix: "rl:public-recent",
    configKeys: { windowMs: "rateLimit.publicRecent.windowMs", maxRequests: "rateLimit.publicRecent.maxRequests" },
  })
);
// General API rate limit. Webhooks are exempt — they're
// server-to-server from Clerk/Stripe and don't carry user auth.
app.use("/api/*", rateLimit({
  windowMs: 60_000, maxRequests: 120, keyPrefix: "rl:api",
  skipPaths: ["/api/webhooks/", "/api/health"],
  configKeys: { windowMs: "rateLimit.api.windowMs", maxRequests: "rateLimit.api.maxRequests" },
}));

// Cache read-heavy endpoints
app.use("/api/podcasts/catalog", cacheResponse({ maxAge: 300, staleWhileRevalidate: 60 }));
app.use("/api/health/deep", cacheResponse({ maxAge: 30 }));

// Security headers — CSP, X-Frame-Options, etc. for all responses
app.use("/*", securityHeaders);

// Public Blipp pages — server-rendered HTML for SEO (no auth)
app.route("/p", publicPages);

// Dynamic sitemap — includes all public Blipp pages
app.route("/", sitemap);

// ads.txt — required at the site root for AdSense. Body is computed from
// ADSENSE_PUBLISHER_ID at request time so we can flip env vars without redeploy.
app.get("/ads.txt", async (c) => {
  const { adsTxtBody } = await import("./lib/ads");
  return c.text(adsTxtBody(c.env), 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "public, max-age=3600",
  });
});

// Dynamic robots.txt
app.get("/robots.txt", (c) => {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /home
Disallow: /settings
Disallow: /admin
Disallow: /browse

Sitemap: https://podblipp.com/sitemap.xml
`;
  return c.text(body, 200, { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" });
});

// Mount all API routes under /api
app.route("/api", routes);

export default {
  fetch: (request: Request, env: any, ctx: ExecutionContext) => {
    return app.fetch(request, shimQueuesForLocalDev(env as Env, ctx), ctx);
  },
  queue: (batch: MessageBatch, env: any, ctx: ExecutionContext) => {
    return handleQueue(batch, shimQueuesForLocalDev(env as Env, ctx), ctx);
  },
  scheduled: (event: any, env: any, ctx: ExecutionContext) => {
    return scheduled(event as ScheduledEvent, shimQueuesForLocalDev(env as Env, ctx), ctx);
  },
};
