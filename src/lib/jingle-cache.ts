const JINGLE_URLS = {
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
  try {
    const url = JINGLE_URLS[type];

    // Try Cache API first
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.set(type, blobUrl);
        return blobUrl;
      }

      // Cache miss — fetch from network
      const response = await fetch(url);
      if (!response.ok) return null;

      // Clone before consuming — one for cache, one for blob URL
      await cache.put(url, response.clone());
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.set(type, blobUrl);
      return blobUrl;
    }

    // No Cache API — unavailable
    return null;
  } catch {
    return null;
  }
}
