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
import { routes } from "./routes/index";
import { handleQueue, scheduled } from "./queues/index";
import { shimQueuesForLocalDev } from "./lib/local-queue";
import { rateLimit } from "./middleware/rate-limit";
import { deepHealthCheck } from "./lib/health";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global error handler — catches all unhandled throws from routes/middleware
app.onError((err, c) => {
  const { status, message, code } = classifyHttpError(err);
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
          "https://blipp.app",
          "https://www.blipp.app",
        ];
    return allowedOrigins.includes(origin) ? origin : "";
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Clerk auth middleware — populates auth context for all API routes
app.use("/api/*", clerkMiddleware());

// Request logger — after auth so userId is available
app.use("/api/*", requestLogger);

// Prisma middleware — creates per-request PrismaClient on c.get("prisma")
app.use("/api/*", prismaMiddleware);

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

// Mount all API routes under /api
app.route("/api", routes);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, shimQueuesForLocalDev(env, ctx), ctx);
  },
  queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    return handleQueue(batch, shimQueuesForLocalDev(env, ctx), ctx);
  },
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    return scheduled(event, shimQueuesForLocalDev(env, ctx), ctx);
  },
};
