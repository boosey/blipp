import { Capacitor } from "@capacitor/core";

/**
 * Returns the base URL for API calls.
 * - On web (browser): empty string (relative paths work via same-origin)
 * - On native (Capacitor iOS/Android): production URL since SPA is served locally
 */
export function getApiBase(): string {
  if (Capacitor.isNativePlatform()) {
    return "https://podblipp.com";
  }
  return "";
}
