import { Capacitor } from "@capacitor/core";

/**
 * Returns the base URL for API calls.
 * - On web (browser): empty string (relative paths work via same-origin)
 * - On native (Capacitor iOS/Android): uses VITE_API_BASE_URL from build env
 */
export function getApiBase(): string {
  if (Capacitor.isNativePlatform()) {
    if (!import.meta.env.VITE_API_BASE_URL) {
      throw new Error("VITE_API_BASE_URL is required for native builds");
    }
    return import.meta.env.VITE_API_BASE_URL;
  }
  return "";
}
