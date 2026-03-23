/**
 * Clerk FAPI proxy for Capacitor native apps.
 *
 * Capacitor WebViews use `capacitor://` as their origin, which Clerk's
 * Frontend API rejects. This proxy forwards requests from `/__clerk/*`
 * to `clerk.podblipp.com/*`, stripping the problematic Origin header.
 */
import { Hono } from "hono";
import type { Env } from "../types";

const CLERK_FAPI = "https://clerk.podblipp.com";

const clerkProxy = new Hono<{ Bindings: Env }>();

clerkProxy.all("/*", async (c) => {
  const path = c.req.path.replace(/^\/__clerk/, "");
  const url = new URL(path + "?" + new URL(c.req.url).searchParams, CLERK_FAPI);

  const headers = new Headers(c.req.raw.headers);
  // Remove the capacitor:// origin that Clerk rejects
  headers.delete("origin");
  headers.set("origin", CLERK_FAPI);

  const resp = await fetch(url.toString(), {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
  });

  const respHeaders = new Headers(resp.headers);
  // Allow the capacitor origin
  respHeaders.set("access-control-allow-origin", c.req.header("origin") || "*");
  respHeaders.set("access-control-allow-credentials", "true");

  return new Response(resp.body, {
    status: resp.status,
    headers: respHeaders,
  });
});

export { clerkProxy };
