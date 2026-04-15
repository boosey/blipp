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
app.all("/__clerk/*", async (c) => {
  const origin = c.req.header("origin") ?? "";
  if (!c.env.ALLOWED_ORIGINS) {
    throw new Error("ALLOWED_ORIGINS env var is required");
  }
  const allowedOrigins = c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim());
  const corsOrigin = allowedOrigins.includes(origin) ? origin : "";

  // Handle CORS preflight
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": c.req.header("access-control-request-headers") ?? "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Proxy to Clerk's Frontend API
  const url = new URL(c.req.url);
  const clerkPath = url.pathname.replace("/__clerk", "");
  const targetUrl = `${c.env.CLERK_FAPI_URL}${clerkPath}${url.search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");

  const resp = await fetch(targetUrl, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
  });

  const proxyResp = new Response(resp.body, resp);
  proxyResp.headers.set("Access-Control-Allow-Origin", corsOrigin);
  proxyResp.headers.set("Access-Control-Allow-Credentials", "true");
  return proxyResp;
});

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
app.get("/sitemap.xml", prismaMiddleware, async (c) => {
  const prisma = c.get("prisma") as any;
  const SITE = "https://podblipp.com";

  // Static pages
  const staticUrls = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/about", priority: "0.7", changefreq: "monthly" },
    { loc: "/pricing", priority: "0.8", changefreq: "monthly" },
    { loc: "/contact", priority: "0.5", changefreq: "monthly" },
    { loc: "/how-it-works", priority: "0.8", changefreq: "monthly" },
    { loc: "/blog/why-you-dont-need-to-listen-to-every-podcast", priority: "0.7", changefreq: "monthly" },
    { loc: "/blog/best-way-to-keep-up-with-podcasts", priority: "0.7", changefreq: "monthly" },
  ];

  // Public episode pages
  const episodes = await prisma.episode.findMany({
    where: { publicPage: true, slug: { not: null } },
    select: { slug: true, updatedAt: true, podcast: { select: { slug: true } } },
  });

  // Show pages (podcasts with at least one public episode)
  const podcastSlugs = [...new Set(episodes.map((e: any) => e.podcast.slug).filter(Boolean))];

  // Category pages
  const categories = await prisma.category.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const s of staticUrls) {
    xml += `<url><loc>${SITE}${s.loc}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>\n`;
  }
  for (const slug of podcastSlugs) {
    xml += `<url><loc>${SITE}/p/${slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  }
  for (const ep of episodes) {
    if (!ep.podcast.slug) continue;
    const lastmod = ep.updatedAt ? new Date(ep.updatedAt).toISOString().split("T")[0] : "";
    xml += `<url><loc>${SITE}/p/${ep.podcast.slug}/${ep.slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>0.6</priority></url>\n`;
  }
  for (const cat of categories) {
    xml += `<url><loc>${SITE}/p/category/${cat.slug}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n`;
  }
  xml += `</urlset>`;

  return c.text(xml, 200, {
    "Content-Type": "application/xml",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
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
