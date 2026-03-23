import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { Env } from "../types";

/**
 * Middleware that logs every HTTP request in structured JSON.
 * Emits one log line after the response is complete.
 */
export const requestLogger = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const status = c.res.status;
    const requestId = c.get("requestId") ?? c.req.header("x-request-id");
    let auth: ReturnType<typeof getAuth> | null = null;
    try { auth = getAuth(c); } catch {}

    // Skip logging for health checks to reduce noise
    if (c.req.path === "/api/health") return;

    const logLine = JSON.stringify({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      action: "http_request",
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
      requestId,
      userId: auth?.userId ?? undefined,
      userAgent: c.req.header("user-agent")?.slice(0, 200),
      ts: new Date().toISOString(),
    });

    if (status >= 500) {
      console.error(logLine);
    } else {
      console.log(logLine);
    }
  }
);
