/**
 * Clerk FAPI proxy for Capacitor native apps.
 *
 * Capacitor WebViews use `capacitor://` as their origin, which Clerk's
 * Frontend API rejects. This proxy forwards requests from `/api/__clerk/*`
 * to `clerk.podblipp.com/*`, replacing the Origin header.
 */
import type { Context } from "hono";
import type { Env } from "../types";

const CLERK_FAPI = "https://clerk.podblipp.com";

export async function handleClerkProxy(c: Context<{ Bindings: Env }>) {
  const requestOrigin = c.req.header("origin") || "*";

  // Handle CORS preflight
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": requestOrigin,
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization, x-clerk-api-version",
        "access-control-allow-credentials": "true",
        "access-control-max-age": "86400",
      },
    });
  }

  // Strip /api/__clerk prefix to get the Clerk API path
  const path = c.req.path.replace(/^\/api\/__clerk/, "");
  const qs = new URL(c.req.url).search;
  const targetUrl = `${CLERK_FAPI}${path}${qs}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("origin");
  headers.set("origin", CLERK_FAPI);
  headers.delete("host");

  // Log for debugging
  console.log(JSON.stringify({
    action: "clerk_proxy",
    method: c.req.method,
    path,
    hasCookie: !!headers.get("cookie"),
    hasAuth: !!headers.get("authorization"),
  }));

  const resp = await fetch(targetUrl, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
  });

  // Log response status for debugging
  if (resp.status >= 400) {
    const body = await resp.clone().text();
    console.log(JSON.stringify({
      action: "clerk_proxy_error",
      status: resp.status,
      path,
      body: body.substring(0, 500),
    }));
  }

  // Copy response and add CORS headers
  const respHeaders = new Headers(resp.headers);
  respHeaders.set("access-control-allow-origin", requestOrigin);
  respHeaders.set("access-control-allow-credentials", "true");

  return new Response(resp.body, {
    status: resp.status,
    headers: respHeaders,
  });
}
