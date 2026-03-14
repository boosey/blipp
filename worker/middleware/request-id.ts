import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

/**
 * Middleware that assigns a unique request ID to every HTTP request.
 * If the client sends an `x-request-id` header, it is reused; otherwise
 * a new UUID is generated.
 */
export const requestIdMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  }
);
