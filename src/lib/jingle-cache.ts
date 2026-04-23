import { getApiBase } from "./api-base";

const JINGLE_PATHS = {
  intro: "/api/assets/jingles/intro.mp3",
  outro: "/api/assets/jingles/outro.mp3",
} as const;

const CACHE_NAME = "blipp-jingles";

/** Module-level blob URL cache — survives across calls without re-reading Cache API. */
const blobUrls = new Map<string, string>();

/** Tracks in-flight fetches to avoid duplicate requests. */
const pending = new Map<string, Promise<string | null>>();

/**
 * Returns a blob URL for the given jingle type, or null if unavailable.
 *
 * On first call, eagerly primes both jingles in parallel.
 * Returns null (non-blocking) if the jingle hasn't been fetched yet
 * or is unavailable (404, network error, Cache API missing).
 */
export async function getJingleUrl(
  type: "intro" | "outro"
): Promise<string | null> {
  // Return cached blob URL immediately
  const cached = blobUrls.get(type);
  if (cached) return cached;

  // Check for in-flight request
  const inflight = pending.get(type);
  if (inflight) return inflight;

  // Prime both jingles in parallel on first access
  if (pending.size === 0) {
    for (const t of ["intro", "outro"] as const) {
      pending.set(t, loadJingle(t));
    }
  } else if (!pending.has(type)) {
    pending.set(type, loadJingle(type));
  }

  return pending.get(type)!;
}

async function loadJingle(type: "intro" | "outro"): Promise<string | null> {
  // Native apps (Capacitor) need the absolute API origin; web same-origin returns "".
  const url = `${getApiBase()}${JINGLE_PATHS[type]}`;

  try {
    if (typeof caches === "undefined") {
      console.warn(`[jingle-cache] Cache API unavailable for ${type}`);
      return null;
    }

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);

    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.set(type, blobUrl);
      return blobUrl;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[jingle-cache] fetch ${type} failed: ${response.status} ${url}`);
      return null;
    }

    // cache.put can throw on iOS Safari (private browsing, quota). Don't let
    // that block playback — store the blob URL even if caching fails.
    try {
      await cache.put(url, response.clone());
    } catch (err) {
      console.warn(`[jingle-cache] cache.put ${type} failed`, err);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.set(type, blobUrl);
    return blobUrl;
  } catch (err) {
    console.warn(`[jingle-cache] loadJingle ${type} threw`, err);
    return null;
  }
}
