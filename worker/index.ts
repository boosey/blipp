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
import { routes } from "./routes/index";
import { handleQueue, scheduled } from "./queues/index";
import { shimQueuesForLocalDev } from "./lib/local-queue";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// CORS for all API routes
app.use("/api/*", cors());

// Clerk auth middleware — populates auth context for all API routes
app.use("/api/*", clerkMiddleware());

// Health check — no auth required (runs before route tree)
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

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
