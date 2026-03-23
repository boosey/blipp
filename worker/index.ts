/**
 * Blipp Worker entry point.
 *
 * Exports the three Cloudflare Worker handlers:
 * - `fetch` — Hono HTTP server (API routes + static assets)
 * - `queue` — Queue consumer dispatcher (feed refresh, distillation, clip gen, briefing assembly)
 * - `scheduled` — Cron trigger handler (enqueues feed refresh every 30 min)
 */
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerkMiddleware } from "./middleware/auth";
import { prismaMiddleware } from "./middleware/prisma";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLogger } from "./middleware/request-logger";
import { classifyHttpError, type ApiErrorResponse } from "./lib/errors";
import { captureException } from "./lib/sentry";
import { routes } from "./routes/index";
import { handleQueue, scheduled } from "./queues/index";
import { shimQueuesForLocalDev } from "./lib/local-queue";
import { apiKeyAuth } from "./middleware/api-key";
import { rateLimit } from "./middleware/rate-limit";
import { securityHeaders } from "./middleware/security-headers";
import { cacheResponse } from "./middleware/cache";
import { deepHealthCheck } from "./lib/health";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global error handler — catches all unhandled throws from routes/middleware
app.onError((err, c) => {
  captureException(err instanceof Error ? err : new Error(String(err)), { method: c.req.method, path: c.req.path });
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

// Request ID — must be first so all other middleware can access it
app.use("/api/*", requestIdMiddleware);

// CORS for all API routes
app.use("/api/*", cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS
      ? c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
      : [
          "http://localhost:8787",
          "http://localhost:5173",
          "https://podblipp.com",
          "https://www.podblipp.com",
          "capacitor://localhost",
          "ionic://localhost",
        ];
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
  const allowedOrigins = [
    "https://podblipp.com",
    "https://www.podblipp.com",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost:8787",
    "http://localhost:5173",
  ];
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
  const targetUrl = `https://clerk.podblipp.com${clerkPath}${url.search}`;

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

// Clerk auth middleware — populates auth context for all API routes
// Skip Clerk for server-to-server requests using Bearer CLERK_SECRET_KEY
app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === c.env.CLERK_SECRET_KEY) {
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
// Specific expensive endpoints get tighter limits.
app.use(
  "/api/briefings/generate",
  rateLimit({ windowMs: 3_600_000, maxRequests: 10, keyPrefix: "rl:generate" })
);
app.use(
  "/api/podcasts/subscribe",
  rateLimit({ windowMs: 60_000, maxRequests: 5, keyPrefix: "rl:subscribe" })
);
// General API rate limit (120 req/min). Webhooks are exempt — they're
// server-to-server from Clerk/Stripe and don't carry user auth.
app.use("/api/*", rateLimit({
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: "rl:api",
  skipPaths: ["/api/webhooks/", "/api/health"],
}));

// Cache read-heavy endpoints
app.use("/api/podcasts/catalog", cacheResponse({ maxAge: 300, staleWhileRevalidate: 60 }));
app.use("/api/health/deep", cacheResponse({ maxAge: 30 }));

// Security headers — CSP, X-Frame-Options, etc. for all responses
app.use("/*", securityHeaders);

// Mount all API routes under /api
app.route("/api", routes);

export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.1 }),
  {
    fetch: (request: Request, env: any, ctx: ExecutionContext) => {
      return app.fetch(request, shimQueuesForLocalDev(env as Env, ctx), ctx);
    },
    queue: (batch: MessageBatch, env: any, ctx: ExecutionContext) => {
      return handleQueue(batch, shimQueuesForLocalDev(env as Env, ctx), ctx);
    },
    scheduled: (event: any, env: any, ctx: ExecutionContext) => {
      return scheduled(event as ScheduledEvent, shimQueuesForLocalDev(env as Env, ctx), ctx);
    },
  } as any
);
