/**
 * Clerk FAPI proxy for Capacitor native apps.
 *
 * Capacitor WebViews use `capacitor://` as their origin, which Clerk's
 * Frontend API rejects. This proxy forwards requests from `/api/__clerk/*`
 * to the Clerk FAPI, replacing the Origin header.
 *
 * The target FAPI URL is determined by CLERK_FAPI_URL env var, defaulting
 * to the production URL. This allows staging to proxy to the dev FAPI.
 */
import type { Context } from "hono";
import type { Env } from "../types";

export async function handleClerkProxy(c: Context<{ Bindings: Env }>) {
  const clerkFapi = c.env.CLERK_FAPI_URL;
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
  const targetUrl = `${clerkFapi}${path}${qs}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("origin");
  headers.set("origin", c.env.APP_ORIGIN);
  headers.delete("host");

  // Log for debugging
  console.log(JSON.stringify({
    action: "clerk_proxy",
    method: c.req.method,
    path,
    target: clerkFapi,
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

  // Copy response and add CORS headers.
  // Rewrite set-cookie headers so cookies are stored for OUR domain,
  // not the Clerk FAPI domain (which the browser won't accept from our proxy).
  const respHeaders = new Headers();

  // Copy all non-set-cookie headers
  for (const [key, value] of resp.headers.entries()) {
    if (key.toLowerCase() !== "set-cookie") {
      respHeaders.append(key, value);
    }
  }

  // Rewrite set-cookie: remove domain restriction so it defaults to our proxy domain.
  const cookies = resp.headers.getSetCookie?.() || [];
  for (const cookie of cookies) {
    const rewritten = cookie
      .replace(/;\s*domain=[^;]*/gi, "")
      .replace(/;\s*samesite=[^;]*/gi, "")
      + "; SameSite=None; Secure";
    respHeaders.append("set-cookie", rewritten);
  }

  respHeaders.set("access-control-allow-origin", requestOrigin);
  respHeaders.set("access-control-allow-credentials", "true");

  return new Response(resp.body, {
    status: resp.status,
    headers: respHeaders,
  });
}
