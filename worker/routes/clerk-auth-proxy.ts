import { Hono } from "hono";
import type { Env } from "../types";

const clerkAuthProxy = new Hono<{ Bindings: Env }>();

clerkAuthProxy.all("/*", async (c) => {
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
  // The route is mounted at /__clerk, so we strip it if Hono hasn't already (depending on how it's mounted)
  // If we use app.route("/__clerk", clerkAuthProxy), then url.pathname will be /__clerk/...
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

export default clerkAuthProxy;
