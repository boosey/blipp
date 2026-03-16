/**
 * Client for Apple Podcasts public APIs (Charts + iTunes Lookup/Search).
 * No authentication required. Uses rate-limiting-friendly delays and retry logic.
 */

const CHARTS_BASE = "https://rss.marketingtools.apple.com/api/v2";
const ITUNES_BASE = "https://itunes.apple.com";
const LOOKUP_BATCH_SIZE = 150;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;
const INTER_REQUEST_DELAY_MS = 500;

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

/** @internal Charts API response shape */
interface ChartsResponse {
  feed: {
    results: AppleChartEntry[];
  };
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
      const res = await fetch(url);

      if (res.ok) return res;

      const status = res.status;
      const isRetryable = status === 429 || status >= 500;

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
   * Fetches the top podcasts chart for a specific genre.
   *
   * @param genreId - Apple genre ID (e.g., "1301" for Arts)
   * @param limit - Max entries to return (default 200)
   * @param country - ISO country code (default "us")
   * @returns Array of chart entries, or empty array on failure
   */
  async topByGenre(
    genreId: string,
    limit: number = 200,
    country: string = "us"
  ): Promise<AppleChartEntry[]> {
    const url = `${CHARTS_BASE}/${country}/podcasts/top/${limit}/podcasts.json?genre=${genreId}`;
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
   * @param limit - Max entries per genre (default 200)
   * @param country - ISO country code (default "us")
   * @returns Deduplicated array of chart entries with merged genre lists
   */
  async topAllGenres(
    limit: number = 200,
    country: string = "us"
  ): Promise<AppleChartEntry[]> {
    const genreIds = Object.keys(APPLE_PODCAST_GENRES);
    const seen = new Map<string, AppleChartEntry>();

    for (const genreId of genreIds) {
      const entries = await this.topByGenre(genreId, limit, country);

      for (const entry of entries) {
        const existing = seen.get(entry.id);
        if (existing) {
          // Merge genres: add any new genre IDs we haven't seen
          const existingGenreIds = new Set(
            existing.genres.map((g) => g.genreId)
          );
          for (const genre of entry.genres) {
            if (!existingGenreIds.has(genre.genreId)) {
              existing.genres.push(genre);
            }
          }
        } else {
          // Clone to avoid shared references
          seen.set(entry.id, { ...entry, genres: [...entry.genres] });
        }
      }

      // Rate-limit: delay between sequential genre fetches
      await delay(INTER_REQUEST_DELAY_MS);
    }

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

      try {
        const res = await fetchWithRetry(url);
        const data = (await res.json()) as ITunesResponse;

        // Filter to podcast results only (exclude artist entries, etc.)
        const podcasts = (data.results ?? []).filter(
          (r) => r.wrapperType === "track" && r.kind === "podcast"
        );
        results.push(...podcasts);
      } catch (err) {
        console.warn(
          `[ApplePodcasts] Lookup batch failed for ${chunk.length} IDs:`,
          err
        );
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
      console.warn(`[ApplePodcasts] Search failed for "${term}":`, err);
      return [];
    }
  }
}
