/**
 * AdSense gating for the Phase 3 staged rollout.
 *
 * Two layers of control:
 *  1. `ADS_ENABLED` — master kill switch. Anything other than "true"
 *     disables ads everywhere, regardless of `ADS_ROUTES`.
 *  2. `ADS_ROUTES` — comma-separated list of route prefixes where ads
 *     are allowed (e.g. "/p" → "/p,/pulse" → "/p,/pulse,/" over weeks).
 *
 * Together they implement the Phase 3 finalization: ads ship per-route,
 * never site-wide on day-one, with one env flip available to yank them
 * during an incident.
 */

import type { Env } from "../types";

interface AdsContext {
  /** Resolved publisher ID (without the "ca-" prefix), or null if not configured. */
  publisherId: string | null;
  /** Whether the master kill switch is on. */
  enabled: boolean;
  /** Parsed allowlist prefixes. Empty array = nothing allowed. */
  routes: string[];
}

export function getAdsContext(env: Env): AdsContext {
  return {
    publisherId: env.ADSENSE_PUBLISHER_ID?.trim() || null,
    enabled: env.ADS_ENABLED === "true",
    routes: (env.ADS_ROUTES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * True when ads should load on the given path.
 *
 * Match is by prefix: `"/p"` matches `/p`, `/p/foo`, `/pulse` (since "/p"
 * is also a prefix of "/pulse"). Callers should use distinct, fully-
 * qualified prefixes ("/p/", "/pulse/") if they want to avoid that.
 *
 * The "/" prefix is special-cased: it would otherwise match every path,
 * including `/admin` and `/api/*`. When "/" is present in the allowlist,
 * we only allow it for paths NOT under reserved prefixes
 * (`/api`, `/admin`, `/__clerk`).
 */
export function adsAllowedForPath(env: Env, path: string): boolean {
  const ctx = getAdsContext(env);
  if (!ctx.enabled || !ctx.publisherId || ctx.routes.length === 0) return false;

  for (const prefix of ctx.routes) {
    if (prefix === "/") {
      if (
        !path.startsWith("/api") &&
        !path.startsWith("/admin") &&
        !path.startsWith("/__clerk")
      ) {
        return true;
      }
      continue;
    }
    if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix)) {
      // Note: matching `path.startsWith(prefix)` lets "/p" match "/p"
      // alone (no trailing slash) — which is what /p (the show index)
      // looks like.
      return true;
    }
  }
  return false;
}

/**
 * Returns the AdSense `<script>` tag to inject into the page <head> when
 * ads are allowed on the path. Returns "" when ads are off — callers can
 * always interpolate the result without a conditional.
 */
export function adsScriptTag(env: Env, path: string): string {
  if (!adsAllowedForPath(env, path)) return "";
  const ctx = getAdsContext(env);
  // ctx.publisherId is non-null when adsAllowedForPath returned true.
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${ctx.publisherId}" crossorigin="anonymous"></script>`;
}

/**
 * Body of the ads.txt file served at the site root. Returns the AdSense
 * authorization line when a publisher ID is configured, otherwise an
 * empty placeholder so crawlers don't 500.
 */
export function adsTxtBody(env: Env): string {
  const ctx = getAdsContext(env);
  if (!ctx.publisherId) {
    return "# Blipp — ADSENSE_PUBLISHER_ID not yet configured.\n";
  }
  return `google.com, ${ctx.publisherId}, DIRECT, f08c47fec0942fa0\n`;
}
