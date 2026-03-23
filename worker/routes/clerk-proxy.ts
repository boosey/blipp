/**
 * Clerk FAPI proxy for Capacitor native apps.
 *
 * Capacitor WebViews use `capacitor://` as their origin, which Clerk's
 * Frontend API rejects. This proxy forwards requests from `/__clerk/*`
 * to `clerk.podblipp.com/*`, stripping the problematic Origin header.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../types";

const CLERK_FAPI = "https://clerk.podblipp.com";

const clerkProxy = new Hono<{ Bindings: Env }>();

// CORS for all proxy requests (handles OPTIONS preflight + response headers)
clerkProxy.use(
  "/*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-clerk-api-version"],
  })
);

clerkProxy.all("/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/__clerk/, "");
  const url = new URL(path + "?" + new URL(c.req.url).searchParams, CLERK_FAPI);

  const headers = new Headers(c.req.raw.headers);
  // Remove the capacitor:// origin that Clerk rejects
  headers.delete("origin");
  headers.set("origin", CLERK_FAPI);
  // Remove host so it matches the target
  headers.delete("host");

  const resp = await fetch(url.toString(), {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
});

export { clerkProxy };
