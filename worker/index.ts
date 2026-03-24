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
import { handleClerkProxy } from "./routes/clerk-proxy";
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

// Clerk FAPI proxy for Capacitor native apps — before any /api middleware
app.all("/api/__clerk/*", handleClerkProxy);

// OAuth start — called from the WebView via fetch (which includes CapacitorHttp
// cookies). Extracts the __client cookie, stores it in KV keyed by the OAuth
// state param, and returns the auth URL for the in-app browser.
app.get("/api/oauth-start", async (c) => {
  const authUrl = c.req.query("auth_url");
  const cookies = c.req.header("cookie") || "";
  const clientMatch = cookies.match(/__client=([^;]+)/);
  const clientToken = clientMatch?.[1] || "";

  if (!authUrl) {
    return c.json({ error: "Missing auth_url" }, 400);
  }

  // Extract the state param from the auth URL — this is Clerk's unique
  // identifier for this OAuth flow that will come back in the callback
  const authUrlObj = new URL(authUrl);
  const state = authUrlObj.searchParams.get("state") || "";

  console.log(JSON.stringify({
    action: "oauth_start",
    hasClientToken: !!clientToken,
    tokenLength: clientToken?.length || 0,
    state,
  }));

  // Store the client token keyed by state — the sso-callback will retrieve
  // it to complete the OAuth flow with Clerk's FAPI server-side
  if (clientToken && state && c.env.RATE_LIMIT_KV) {
    await c.env.RATE_LIMIT_KV.put(`oauth_client:${state}`, clientToken, { expirationTtl: 600 });
  }

  const headers = new Headers({
    "content-type": "application/json",
    "access-control-allow-origin": c.req.header("origin") || "*",
    "access-control-allow-credentials": "true",
  });

  return new Response(JSON.stringify({ url: authUrl }), { headers });
});

// OAuth callback — Clerk redirects here after the OAuth callback completes (or fails).
// We DON'T rely on this hitting successfully because Clerk's oauth_callback may fail
// to redirect here if it can't find the __client cookie.
// The real sign-in completion happens in the app via signIn.reload().
// This page just redirects to the app via deep link.
app.get("/api/sso-callback", async (c) => {
  const url = new URL(c.req.url);
  const allParams = url.searchParams.toString();
  const deepLink = `blipp://auth-callback?${allParams}`;

  console.log(JSON.stringify({
    action: "sso_callback",
    params: Object.fromEntries(url.searchParams),
  }));

  return c.html(`<!DOCTYPE html><html><head><title>Sign in complete</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#06060e;color:white">
<p>Returning to Blipp...</p>
<script>
  window.location.href = ${JSON.stringify(deepLink)};
  setTimeout(function() {
    document.querySelector('p').textContent = 'Sign in complete. Please return to the Blipp app.';
  }, 2000);
</script>
</body></html>`);
});

// Create a sign-in ticket for the user who just completed Google OAuth.
// Uses the Clerk Backend API (secret key) to create a ticket that the
// WebView can use to sign in without needing the OAuth session.
app.get("/api/oauth-ticket", async (c) => {
  const state = c.req.query("state") || "";
  const cookies = c.req.header("cookie") || "";
  const clientMatch = cookies.match(/__client=([^;]+)/);
  let clientToken = clientMatch?.[1] || "";

  // Try KV if not in cookies
  if (!clientToken && state && c.env.RATE_LIMIT_KV) {
    clientToken = await c.env.RATE_LIMIT_KV.get(`oauth_client:${state}`) || "";
  }

  console.log(JSON.stringify({
    action: "oauth_ticket",
    state,
    hasClientToken: !!clientToken,
  }));

  if (!clientToken) {
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("access-control-allow-origin", c.req.header("origin") || "*");
    headers.set("access-control-allow-credentials", "true");
    return new Response(JSON.stringify({ error: "No client token found. Please try signing in again." }), {
      status: 400, headers,
    });
  }

  try {
    // Use Clerk Backend API to get the most recently active user
    // The CLERK_SECRET_KEY is needed for Backend API calls
    const secretKey = c.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    // First, get the most recent sessions to find the user
    const sessionsResp = await fetch("https://api.clerk.com/v1/sessions?limit=5&order_by=-created_at", {
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });
    const sessionsData = await sessionsResp.json() as any;
    const sessions = sessionsData?.data || sessionsData || [];

    console.log(JSON.stringify({
      action: "oauth_ticket_sessions",
      count: sessions.length,
      firstUserId: sessions[0]?.user_id,
    }));

    if (sessions.length === 0) {
      throw new Error("No recent sessions found");
    }

    // Get the most recent session's user ID
    const userId = sessions[0]?.user_id;
    if (!userId) {
      throw new Error("No user ID in session");
    }

    // Create a sign-in token (ticket) for this user
    const tokenResp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        expires_in_seconds: 300,
      }),
    });
    const tokenData = await tokenResp.json() as any;

    console.log(JSON.stringify({
      action: "oauth_ticket_created",
      status: tokenResp.status,
      hasToken: !!tokenData?.token,
      userId,
    }));

    const headers = new Headers({ "content-type": "application/json" });
    headers.set("access-control-allow-origin", c.req.header("origin") || "*");
    headers.set("access-control-allow-credentials", "true");

    if (tokenData?.token) {
      return new Response(JSON.stringify({ ticket: tokenData.token, userId }), { headers });
    } else {
      return new Response(JSON.stringify({ error: "Failed to create ticket", details: tokenData }), {
        status: 500, headers,
      });
    }
  } catch (err: any) {
    console.error("oauth-ticket error:", err);
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("access-control-allow-origin", c.req.header("origin") || "*");
    headers.set("access-control-allow-credentials", "true");
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});

// CORS preflight for oauth-complete
app.options("/api/oauth-complete", (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": c.req.header("origin") || "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-allow-credentials": "true",
    },
  });
});

// Server-side OAuth completion — called from the WebView after the user completes
// Google sign-in in the in-app browser. Uses the stored __client token to call
// Clerk's FAPI and complete the sign-in server-side.
app.post("/api/oauth-complete", async (c) => {
  const { signInId, state } = await c.req.json() as any;
  const cookies = c.req.header("cookie") || "";
  const clientMatch = cookies.match(/__client=([^;]+)/);
  let clientToken = clientMatch?.[1] || "";

  // Try to get the token from KV if not in cookies
  if (!clientToken && state && c.env.RATE_LIMIT_KV) {
    clientToken = await c.env.RATE_LIMIT_KV.get(`oauth_client:${state}`) || "";
  }

  console.log(JSON.stringify({
    action: "oauth_complete",
    signInId,
    state,
    hasClientToken: !!clientToken,
  }));

  if (!clientToken || !signInId) {
    return c.json({ error: "Missing client token or sign-in ID" }, 400);
  }

  try {
    // Call Clerk FAPI to get the sign-in status
    const clerkResp = await fetch(
      `https://clerk.podblipp.com/v1/client/sign_ins/${signInId}?__clerk_api_version=2025-11-10`,
      {
        headers: {
          "cookie": `__client=${clientToken}`,
          "origin": "https://clerk.podblipp.com",
        },
      }
    );
    const data = await clerkResp.json();

    console.log(JSON.stringify({
      action: "oauth_complete_result",
      status: clerkResp.status,
      data: JSON.stringify(data).substring(0, 500),
    }));

    const respHeaders = new Headers({ "content-type": "application/json" });
    respHeaders.set("access-control-allow-origin", c.req.header("origin") || "*");
    respHeaders.set("access-control-allow-credentials", "true");

    // Forward any set-cookie from Clerk
    const setCookies = clerkResp.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const rewritten = cookie.replace(/;\s*domain=[^;]*/gi, "")
        .replace(/;\s*samesite=[^;]*/gi, "") + "; SameSite=None; Secure";
      respHeaders.append("set-cookie", rewritten);
    }

    return new Response(JSON.stringify(data), {
      status: clerkResp.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    console.error("oauth-complete error:", err);
    return c.json({ error: err.message }, 500);
  }
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
          "capacitor://podblipp.com",
          "ionic://localhost",
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
