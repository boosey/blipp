/**
 * Client for the Podcast Index API (https://podcastindex-org.github.io/docs-api/).
 * Uses Web Crypto API for auth headers (compatible with Cloudflare Workers).
 */

/** @internal Result shape from Podcast Index search endpoints */
export interface PodcastIndexFeed {
  id: number;
  title: string;
  url: string;
  description: string;
  author: string;
  image: string;
  categories: Record<string, string>;
}

/** @internal Result shape from Podcast Index episodes endpoints */
export interface PodcastIndexEpisode {
  id: number;
  title: string;
  description: string;
  enclosureUrl: string;
  datePublished: number;
  duration: number;
  guid: string;
  transcriptUrl?: string;
  feedId: number;
}

/** @internal API response wrapper for feeds */
interface FeedsResponse {
  status: string;
  feeds: PodcastIndexFeed[];
}

/** @internal API response wrapper for single feed lookup */
interface FeedResponse {
  status: string;
  feed: PodcastIndexFeed;
}

/** @internal API response wrapper for episodes */
interface EpisodesResponse {
  status: string;
  items: PodcastIndexEpisode[];
}

const API_BASE = "https://api.podcastindex.org/api/1.0";

/**
 * Podcast Index API client with Web Crypto auth.
 * All requests are authenticated with API key + SHA-1 HMAC signature.
 */
export class PodcastIndexClient {
  private key: string;
  private secret: string;

  /**
   * @param key - Podcast Index API key
   * @param secret - Podcast Index API secret
   */
  constructor(key: string, secret: string) {
    this.key = key;
    this.secret = secret;
  }

  /**
   * Generates auth headers required by the Podcast Index API.
   * Uses Web Crypto SHA-1 digest (no Node.js crypto dependency).
   *
   * @returns Headers object with X-Auth-Date, X-Auth-Key, Authorization, and User-Agent
   */
  private async authHeaders(): Promise<Record<string, string>> {
    const now = Math.floor(Date.now() / 1000).toString();
    const data = `${this.key}${this.secret}${now}`;

    // Web Crypto API — Workers-compatible SHA-1
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-1",
      encoder.encode(data)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return {
      "X-Auth-Date": now,
      "X-Auth-Key": this.key,
      Authorization: hash,
      "User-Agent": "Blipp/1.0",
    };
  }

  /**
   * Makes an authenticated GET request to the Podcast Index API.
   *
   * @param path - API endpoint path (e.g., "/search/byterm")
   * @param params - URL query parameters
   * @returns Parsed JSON response
   * @throws Error on non-OK HTTP status
   */
  private async request<T>(
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const headers = await this.authHeaders();
    const res = await fetch(url.toString(), { headers });

    if (!res.ok) {
      throw new Error(`Podcast Index API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Searches podcasts by term.
   *
   * @param term - Search query string
   * @param max - Maximum number of results (default 20)
   * @returns Array of matching podcast feeds
   */
  async searchByTerm(
    term: string,
    max: number = 20
  ): Promise<PodcastIndexFeed[]> {
    const data = await this.request<FeedsResponse>("/search/byterm", {
      q: term,
      max: max.toString(),
    });
    return data.feeds ?? [];
  }

  /**
   * Fetches episodes for a podcast by its Podcast Index feed ID.
   *
   * @param feedId - Podcast Index feed ID
   * @param max - Maximum number of episodes (default 10)
   * @returns Array of episodes
   */
  async episodesByFeedId(
    feedId: number,
    max: number = 10
  ): Promise<PodcastIndexEpisode[]> {
    const data = await this.request<EpisodesResponse>("/episodes/byfeedid", {
      id: feedId.toString(),
      max: max.toString(),
    });
    return data.items ?? [];
  }

  /**
   * Fetches episodes for a podcast by its RSS feed URL.
   *
   * @param feedUrl - RSS feed URL
   * @param max - Maximum number of episodes (default 10)
   * @returns Array of episodes
   */
  async episodesByFeedUrl(
    feedUrl: string,
    max: number = 10
  ): Promise<PodcastIndexEpisode[]> {
    const data = await this.request<EpisodesResponse>("/episodes/byfeedurl", {
      url: feedUrl,
      max: max.toString(),
    });
    return data.items ?? [];
  }

  /**
   * Looks up a podcast by its Apple/iTunes collection ID.
   * Returns null if not found in Podcast Index.
   */
  async byItunesId(itunesId: number): Promise<PodcastIndexFeed | null> {
    try {
      const data = await this.request<FeedResponse>("/podcasts/byitunesid", {
        id: itunesId.toString(),
      });
      return data.feed ?? null;
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "podcast_index_byitunesid_failed",
        itunesId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
      return null;
    }
  }

  /**
   * Batch lookup by Apple/iTunes IDs with concurrency limit.
   * Returns a Map of itunesId -> PodcastIndexFeed.
   */
  async batchByItunesId(
    itunesIds: number[],
    concurrency: number = 5
  ): Promise<Map<number, PodcastIndexFeed>> {
    const results = new Map<number, PodcastIndexFeed>();
    const queue = [...itunesIds];
    let looked = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift()!;
        const feed = await this.byItunesId(id);
        looked++;
        if (feed) results.set(id, feed);
        if (looked % 50 === 0 || queue.length === 0) {
          console.log(`[PodcastIndex] Lookup progress: ${looked}/${itunesIds.length} checked, ${results.size} found`);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }

  /**
   * Fetches trending podcasts, optionally filtered by category.
   *
   * @param max - Maximum number of results (default 20, API max 1000)
   * @param lang - Language filter (default "en")
   * @param cat - Podcast Index category name or ID (e.g., "Technology" or "102")
   * @returns Array of trending podcast feeds
   */
  async trending(
    max: number = 20,
    lang: string = "en",
    cat?: string
  ): Promise<PodcastIndexFeed[]> {
    const params: Record<string, string> = {
      max: max.toString(),
      lang,
    };
    if (cat) params.cat = cat;
    const data = await this.request<FeedsResponse>(
      "/podcasts/trending",
      params
    );
    return data.feeds ?? [];
  }
}
