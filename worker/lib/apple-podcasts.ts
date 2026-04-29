/**
 * Client for Apple Podcasts public APIs (Charts + iTunes Lookup/Search).
 * No authentication required. Uses rate-limiting-friendly delays and retry logic.
 */

const CHARTS_BASE = "https://rss.marketingtools.apple.com/api/v2";
const ITUNES_BASE = "https://itunes.apple.com";
const LOOKUP_BATCH_SIZE = 10;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;
const INTER_REQUEST_DELAY_MS = 500;
const USER_AGENT =
  "Mozilla/5.0 (compatible; Blipp/1.0; +https://podblipp.com)";

/** Genre map: Apple genre ID -> human-readable name (19 top-level podcast genres) */
export const APPLE_PODCAST_GENRES: Record<string, string> = {
  "1301": "Arts",
  "1321": "Business",
  "1303": "Comedy",
  "1304": "Education",
  "1483": "Fiction",
  "1511": "Government",
  "1512": "Health & Fitness",
  "1487": "History",
  "1305": "Kids & Family",
  "1502": "Leisure",
  "1310": "Music",
  "1489": "News",
  "1314": "Religion & Spirituality",
  "1533": "Science",
  "1324": "Society & Culture",
  "1545": "Sports",
  "1318": "Technology",
  "1488": "True Crime",
  "1309": "TV & Film",
};

/** Maps Apple sub-genre IDs to their top-level parent genre ID */
export const APPLE_SUBGENRE_TO_PARENT: Record<string, string> = {
  // Arts (1301)
  "1402": "1301", "1405": "1301", "1406": "1301", "1407": "1301", "1482": "1301",
  // Business (1321)
  "1412": "1321", "1491": "1321", "1492": "1321", "1493": "1321", "1494": "1321",
  // Comedy (1303)
  "1495": "1303", "1496": "1303", "1497": "1303", "1498": "1303",
  // Education (1304)
  "1499": "1304", "1500": "1304", "1501": "1304",
  // Fiction (1483)
  "1484": "1483", "1485": "1483", "1486": "1483",
  // Health & Fitness (1512)
  "1513": "1512", "1514": "1512", "1515": "1512", "1516": "1512", "1517": "1512",
  // Kids & Family (1305)
  "1519": "1305", "1520": "1305", "1521": "1305", "1522": "1305",
  // Leisure (1502)
  "1503": "1502", "1504": "1502", "1506": "1502", "1507": "1502", "1508": "1502",
  // Music (1310)
  "1523": "1310", "1524": "1310",
  // News (1489)
  "1526": "1489", "1527": "1489", "1528": "1489", "1529": "1489", "1530": "1489",
  // Religion & Spirituality (1314)
  "1438": "1314", "1439": "1314", "1440": "1314", "1441": "1314", "1442": "1314", "1443": "1314", "1444": "1314",
  // Science (1533)
  "1534": "1533", "1535": "1533", "1536": "1533", "1537": "1533", "1538": "1533",
  // Society & Culture (1324)
  "1302": "1324", "1539": "1324", "1540": "1324", "1541": "1324", "1542": "1324", "1543": "1324",
  // Sports (1545)
  "1546": "1545", "1547": "1545", "1548": "1545", "1549": "1545", "1550": "1545",
  "1551": "1545", "1552": "1545", "1553": "1545", "1554": "1545", "1555": "1545",
  "1556": "1545", "1557": "1545", "1558": "1545", "1559": "1545", "1560": "1545",
  // TV & Film (1309)
  "1561": "1309", "1562": "1309", "1563": "1309",
};

/**
 * Resolves a genre ID to its top-level parent.
 * Returns the same ID if it's already a top-level genre.
 */
export function resolveTopLevelGenre(genreId: string): { genreId: string; name: string } | null {
  if (APPLE_PODCAST_GENRES[genreId]) {
    return { genreId, name: APPLE_PODCAST_GENRES[genreId] };
  }
  const parentId = APPLE_SUBGENRE_TO_PARENT[genreId];
  if (parentId && APPLE_PODCAST_GENRES[parentId]) {
    return { genreId: parentId, name: APPLE_PODCAST_GENRES[parentId] };
  }
  return null;
}

/** A genre entry from the Charts API response */
export interface AppleChartGenre {
  genreId: string;
  name: string;
  url: string;
}

/** An entry from the Apple Podcasts Charts API */
export interface AppleChartEntry {
  id: string;
  name: string;
  artistName: string;
  artworkUrl100: string;
  genres: AppleChartGenre[];
  url: string;
}

/** A podcast-episode entry from the iTunes Lookup API */
export interface AppleEpisodeLookupResult {
  trackId: number;
  episodeGuid: string | null;
  trackName: string;
}

/** A result from the iTunes Lookup or Search API */
export interface AppleLookupResult {
  wrapperType: string;
  kind: string;
  collectionId: number;
  collectionName: string;
  artistName: string;
  feedUrl: string;
  artworkUrl600: string;
  genres: string[];
  genreIds: string[];
  primaryGenreName: string;
  trackCount: number;
  contentAdvisoryRating: string;
}

/** An entry from the iTunes RSS feed (older endpoint that supports genre filtering) */
export interface AppleRSSEntry {
  id: string;
  name: string;
  artistName: string;
  artworkUrl100: string;
  genres: AppleChartGenre[];
  url: string;
}

/** @internal Charts API response shape */
interface ChartsResponse {
  feed: {
    results: AppleChartEntry[];
  };
}

/** @internal iTunes RSS feed response shape */
interface ITunesRSSResponse {
  feed: {
    entry: ITunesRSSEntry[];
  };
}

/** @internal Raw entry from iTunes RSS feed */
interface ITunesRSSEntry {
  "im:name": { label: string };
  "im:artist": { label: string };
  "im:image": { label: string; attributes: { height: string } }[];
  id: { label: string; attributes: { "im:id": string } };
  category: { attributes: { "im:id": string; label: string } };
  link: { attributes: { href: string } };
}

/** @internal iTunes Lookup/Search response shape */
interface ITunesResponse {
  resultCount: number;
  results: AppleLookupResult[];
}

/**
 * Delays execution by the given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with exponential backoff retry on 429/5xx errors.
 *
 * @param url - URL to fetch
 * @param retries - Maximum number of retries
 * @returns Response object
 * @throws Error if all retries are exhausted or a non-retryable error occurs
 */
async function fetchWithRetry(
  url: string,
  retries: number = RETRY_MAX
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (res.ok) return res;

      const status = res.status;
      const isRetryable = status === 403 || status === 429 || status >= 500;

      if (!isRetryable || attempt === retries) {
        throw new Error(
          `Apple API error: ${status} ${res.statusText} for ${url}`
        );
      }

      // Exponential backoff: 1s, 2s, 4s, ...
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
      await delay(backoff);
    } catch (err) {
      lastError = err as Error;

      // If it's a non-fetch error (network failure) and we have retries left, retry
      if (
        attempt < retries &&
        !(err instanceof Error && err.message.startsWith("Apple API error"))
      ) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("fetchWithRetry: unexpected end of retries");
}

/**
 * Client for Apple Podcasts public APIs.
 * Provides access to Charts (top podcasts by genre), iTunes Lookup, and Search.
 */
export class ApplePodcastsClient {
  /**
   * Fetches the overall top 200 podcasts using the iTunes RSS endpoint.
   * This endpoint reliably returns the top chart (unlike the Charts API which ignores genre filters).
   *
   * @param country - ISO country code (default "us")
   * @returns Array of RSS entries with Apple IDs, or empty array on failure
   */
  async top200(country: string = "us"): Promise<AppleRSSEntry[]> {
    const url = `${ITUNES_BASE}/${country}/rss/toppodcasts/limit=200/json`;
    console.log(JSON.stringify({ level: "info", action: "apple_top200_fetch", url, ts: new Date().toISOString() }));
    try {
      const res = await fetchWithRetry(url);
      console.log(JSON.stringify({ level: "info", action: "apple_top200_response", status: res.status, statusText: res.statusText, ts: new Date().toISOString() }));
      const data = (await res.json()) as ITunesRSSResponse;
      const entries = data.feed?.entry ?? [];
      console.log(JSON.stringify({ level: "info", action: "apple_top200_parsed", entryCount: entries.length, ts: new Date().toISOString() }));

      return entries.map((e) => {
        const images = e["im:image"] ?? [];
        const largestImage = images[images.length - 1]?.label ?? "";
        return {
          id: e.id?.attributes?.["im:id"] ?? "",
          name: e["im:name"]?.label ?? "",
          artistName: e["im:artist"]?.label ?? "",
          artworkUrl100: largestImage,
          genres: e.category
            ? (() => {
                const rawId = e.category.attributes["im:id"];
                const resolved = resolveTopLevelGenre(rawId);
                if (resolved) {
                  return [{ genreId: resolved.genreId, name: resolved.name, url: "" }];
                }
                // Fallback: use raw ID and label if no parent mapping exists
                return [{ genreId: rawId, name: e.category.attributes.label, url: "" }];
              })()
            : [],
          url: e.link?.attributes?.href ?? e.id?.label ?? "",
        };
      });
    } catch (err) {
      console.warn("[ApplePodcasts] Failed to fetch top 200:", err);
      return [];
    }
  }

  /**
   * Fetches the top podcasts chart for a specific genre.
   *
   * @param genreId - Apple genre ID (e.g., "1301" for Arts)
   * @param limit - Max entries to return (default 200)
   * @param country - ISO country code (default "us")
   * @returns Array of chart entries, or empty array on failure
   */
  async topByGenre(
    genreId: string,
    limit: number = 100,
    country: string = "us"
  ): Promise<AppleChartEntry[]> {
    // Apple's genre charts cap at 100; requesting more returns 500
    const cappedLimit = Math.min(limit, 100);
    const url = `${CHARTS_BASE}/${country}/podcasts/top/${cappedLimit}/podcasts.json?genre=${genreId}`;
    try {
      const res = await fetchWithRetry(url);
      const data = (await res.json()) as ChartsResponse;
      return data.feed?.results ?? [];
    } catch (err) {
      console.warn(
        `[ApplePodcasts] Failed to fetch chart for genre ${genreId}:`,
        err
      );
      return [];
    }
  }

  /**
   * Fetches top podcasts across all 19 genres, deduplicating by ID and merging genres.
   *
   * @param limit - Max entries per genre (default 100, Apple caps at 100)
   * @param country - ISO country code (default "us")
   * @returns Deduplicated array of chart entries with merged genre lists
   */
  async topAllGenres(
    limit: number = 100,
    country: string = "us"
  ): Promise<AppleChartEntry[]> {
    const genreIds = Object.keys(APPLE_PODCAST_GENRES);
    const seen = new Map<string, AppleChartEntry>();

    // Fetch all genres in parallel (Workers has limited CPU time for sequential + delays)
    const results = await Promise.allSettled(
      genreIds.map((genreId) => this.topByGenre(genreId, limit, country))
    );

    let totalFetched = 0;
    for (let i = 0; i < genreIds.length; i++) {
      const result = results[i];
      const genreName = APPLE_PODCAST_GENRES[genreIds[i]];
      if (result.status !== "fulfilled") {
        console.warn(JSON.stringify({ level: "warn", action: "apple_genre_failed", genreId: genreIds[i], genreName, reason: String(result.reason), ts: new Date().toISOString() }));
        continue;
      }
      const entries = result.value;
      const prevSize = seen.size;
      totalFetched += entries.length;

      for (const entry of entries) {
        const existing = seen.get(entry.id);
        if (existing) {
          const existingGenreIds = new Set(
            existing.genres.map((g) => g.genreId)
          );
          for (const genre of entry.genres) {
            if (!existingGenreIds.has(genre.genreId)) {
              existing.genres.push(genre);
            }
          }
        } else {
          seen.set(entry.id, { ...entry, genres: [...entry.genres] });
        }
      }

      const newUnique = seen.size - prevSize;
      console.log(JSON.stringify({ level: "info", action: "apple_genre_done", genreId: genreIds[i], genreName, fetched: entries.length, newUnique, totalFetched, totalUnique: seen.size, ts: new Date().toISOString() }));
    }

    console.log(JSON.stringify({ level: "info", action: "apple_all_genres_done", totalFetched, totalUnique: seen.size, ts: new Date().toISOString() }));
    return Array.from(seen.values());
  }

  /**
   * Looks up podcasts by Apple collection IDs in batches of 150.
   * Filters results to podcast entries only. Retries on 429/5xx.
   *
   * @param ids - Array of Apple collection IDs
   * @returns Array of lookup results with feedUrl, or empty array on failure
   */
  async lookupBatch(ids: number[]): Promise<AppleLookupResult[]> {
    if (ids.length === 0) return [];

    const results: AppleLookupResult[] = [];

    // Chunk IDs into groups of LOOKUP_BATCH_SIZE
    for (let i = 0; i < ids.length; i += LOOKUP_BATCH_SIZE) {
      const chunk = ids.slice(i, i + LOOKUP_BATCH_SIZE);
      const csvIds = chunk.join(",");
      const url = `${ITUNES_BASE}/lookup?id=${csvIds}&entity=podcast`;
      console.log(JSON.stringify({ level: "info", action: "apple_lookup_batch", batch: Math.floor(i / LOOKUP_BATCH_SIZE) + 1, idCount: chunk.length, ts: new Date().toISOString() }));

      try {
        const res = await fetchWithRetry(url);
        console.log(JSON.stringify({ level: "info", action: "apple_lookup_response", status: res.status, statusText: res.statusText, ts: new Date().toISOString() }));
        const data = (await res.json()) as ITunesResponse;

        // Filter to podcast results only (exclude artist entries, etc.)
        const podcasts = (data.results ?? []).filter(
          (r) => r.wrapperType === "track" && r.kind === "podcast"
        );
        console.log(JSON.stringify({ level: "info", action: "apple_lookup_results", resultCount: data.resultCount, podcastCount: podcasts.length, ts: new Date().toISOString() }));
        results.push(...podcasts);
      } catch (err) {
        console.warn(JSON.stringify({ level: "warn", action: "apple_lookup_batch_failed", idCount: chunk.length, error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
        // Continue with next chunk rather than failing entirely
      }

      // Rate-limit between chunks
      if (i + LOOKUP_BATCH_SIZE < ids.length) {
        await delay(INTER_REQUEST_DELAY_MS);
      }
    }

    return results;
  }

  /**
   * Looks up episodes for a podcast by Apple collection ID.
   *
   * @param collectionId - Apple podcast collection ID (Podcast.appleId)
   * @param limit - Max episodes to return (default 300, Apple typically caps around 300)
   * @returns Array of episode entries, or empty array on failure
   */
  async lookupEpisodes(
    collectionId: string,
    limit: number = 300
  ): Promise<AppleEpisodeLookupResult[]> {
    const url = `${ITUNES_BASE}/lookup?id=${collectionId}&entity=podcastEpisode&limit=${limit}`;
    try {
      const res = await fetchWithRetry(url);
      const data = (await res.json()) as { resultCount: number; results: any[] };
      return (data.results ?? [])
        .filter((r) => r.wrapperType === "podcastEpisode")
        .map((r) => ({
          trackId: r.trackId,
          episodeGuid: r.episodeGuid ?? null,
          trackName: r.trackName ?? "",
        }));
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "apple_lookup_episodes_failed",
        collectionId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
      return [];
    }
  }

  /**
   * Searches iTunes for podcasts by term.
   *
   * @param term - Search query
   * @param limit - Max results (default 25)
   * @returns Array of search results, or empty array on failure
   */
  async search(
    term: string,
    limit: number = 25
  ): Promise<AppleLookupResult[]> {
    const url = `${ITUNES_BASE}/search?term=${encodeURIComponent(term)}&media=podcast&limit=${limit}`;
    try {
      const res = await fetchWithRetry(url);
      const data = (await res.json()) as ITunesResponse;
      return data.results ?? [];
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", action: "apple_search_failed", term, error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
      return [];
    }
  }
}
