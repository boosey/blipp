import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

/**
 * Security headers middleware.
 * Adds Content-Security-Policy and other security headers to all responses.
 */
export const securityHeaders = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    await next();

    // Content Security Policy
    c.header("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.clerk.dev https://*.clerk.accounts.dev https://imasdk.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.clerk.dev https://*.clerk.accounts.dev https://api.clerk.dev https://*.neon.tech https://api.stripe.com https://*.googlesyndication.com https://*.doubleclick.net https://imasdk.googleapis.com",
      "frame-src 'self' https://*.clerk.dev https://*.stripe.com",
      "media-src 'self' blob: https://*.googlesyndication.com https://*.doubleclick.net",
    ].join("; "));

    // Other security headers
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
);
