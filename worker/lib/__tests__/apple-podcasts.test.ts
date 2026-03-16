import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  APPLE_PODCAST_GENRES,
  ApplePodcastsClient,
  type AppleChartEntry,
  type AppleLookupResult,
} from "../apple-podcasts";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Suppress console.warn in tests
vi.stubGlobal("console", { ...console, warn: vi.fn() });

function chartResponse(results: Partial<AppleChartEntry>[]): object {
  return {
    ok: true,
    json: () => Promise.resolve({ feed: { results } }),
  };
}

function lookupResponse(results: Partial<AppleLookupResult>[]): object {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ resultCount: results.length, results }),
  };
}

function searchResponse(results: Partial<AppleLookupResult>[]): object {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ resultCount: results.length, results }),
  };
}

describe("Apple Podcasts Client", () => {
  let client: ApplePodcastsClient;

  beforeEach(() => {
    client = new ApplePodcastsClient();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("APPLE_PODCAST_GENRES", () => {
    it("should have 19 genre entries", () => {
      expect(Object.keys(APPLE_PODCAST_GENRES)).toHaveLength(19);
    });

    it("should map genre IDs to human-readable names", () => {
      expect(APPLE_PODCAST_GENRES["1301"]).toBe("Arts");
      expect(APPLE_PODCAST_GENRES["1318"]).toBe("Technology");
      expect(APPLE_PODCAST_GENRES["1488"]).toBe("True Crime");
    });
  });

  describe("topByGenre", () => {
    it("should fetch chart entries for a genre", async () => {
      const entries: Partial<AppleChartEntry>[] = [
        { id: "1", name: "Podcast A", artistName: "Author A", artworkUrl100: "https://img/a.jpg", genres: [{ genreId: "1301", name: "Arts", url: "" }], url: "https://apple.com/1" },
        { id: "2", name: "Podcast B", artistName: "Author B", artworkUrl100: "https://img/b.jpg", genres: [{ genreId: "1301", name: "Arts", url: "" }], url: "https://apple.com/2" },
      ];
      mockFetch.mockResolvedValueOnce(chartResponse(entries));

      const promise = client.topByGenre("1301");
      // Advance past any internal delays
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("1");
      expect(result[1].name).toBe("Podcast B");

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("/us/podcasts/top/200/genre=1301/podcasts.json");
    });

    it("should use custom limit and country", async () => {
      mockFetch.mockResolvedValueOnce(chartResponse([]));

      const promise = client.topByGenre("1303", 50, "gb");
      await vi.runAllTimersAsync();
      await promise;

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("/gb/podcasts/top/50/genre=1303/podcasts.json");
    });

    it("should return empty array on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });

      const promise = client.topByGenre("1301");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([]);
    });

    it("should return empty array on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const promise = client.topByGenre("1301");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([]);
    });
  });

  describe("topAllGenres", () => {
    it("should deduplicate entries across genres by ID", async () => {
      // Podcast "1" appears in both Arts and Comedy
      const artsEntries: Partial<AppleChartEntry>[] = [
        { id: "1", name: "Shared Podcast", artistName: "Author", artworkUrl100: "", genres: [{ genreId: "1301", name: "Arts", url: "" }], url: "" },
        { id: "2", name: "Arts Only", artistName: "Author", artworkUrl100: "", genres: [{ genreId: "1301", name: "Arts", url: "" }], url: "" },
      ];
      const comedyEntries: Partial<AppleChartEntry>[] = [
        { id: "1", name: "Shared Podcast", artistName: "Author", artworkUrl100: "", genres: [{ genreId: "1303", name: "Comedy", url: "" }], url: "" },
        { id: "3", name: "Comedy Only", artistName: "Author", artworkUrl100: "", genres: [{ genreId: "1303", name: "Comedy", url: "" }], url: "" },
      ];

      // Mock 19 genre fetches: first two return data, rest return empty
      let callIndex = 0;
      mockFetch.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return Promise.resolve(chartResponse(artsEntries));
        if (callIndex === 2) return Promise.resolve(chartResponse(comedyEntries));
        return Promise.resolve(chartResponse([]));
      });

      const promise = client.topAllGenres();
      await vi.runAllTimersAsync();
      const result = await promise;

      // Should have 3 unique podcasts, not 4
      expect(result).toHaveLength(3);

      // Find the shared podcast — it should have merged genres from both
      const shared = result.find((e) => e.id === "1");
      expect(shared).toBeDefined();
      expect(shared!.genres.length).toBeGreaterThanOrEqual(2);

      // Verify genre IDs are merged
      const genreIds = shared!.genres.map((g) => g.genreId);
      expect(genreIds).toContain("1301");
      expect(genreIds).toContain("1303");
    });

    it("should fetch all 19 genres", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(chartResponse([])));

      const promise = client.topAllGenres();
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(19);
    });
  });

  describe("lookupBatch", () => {
    it("should resolve Apple IDs to full metadata with feedUrl", async () => {
      const lookupResults: Partial<AppleLookupResult>[] = [
        {
          wrapperType: "track",
          kind: "podcast",
          collectionId: 123,
          collectionName: "Test Podcast",
          artistName: "Author",
          feedUrl: "https://example.com/feed.xml",
          artworkUrl600: "https://img/600.jpg",
          genres: ["Technology"],
          genreIds: ["1318"],
          primaryGenreName: "Technology",
          trackCount: 100,
          contentAdvisoryRating: "Clean",
        },
      ];
      mockFetch.mockResolvedValueOnce(lookupResponse(lookupResults));

      const promise = client.lookupBatch([123]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].feedUrl).toBe("https://example.com/feed.xml");
      expect(result[0].collectionName).toBe("Test Podcast");

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("id=123");
      expect(url).toContain("entity=podcast");
    });

    it("should chunk IDs into groups of 150", async () => {
      // Create 300 IDs — should result in 2 fetch calls
      const ids = Array.from({ length: 300 }, (_, i) => i + 1);

      mockFetch.mockImplementation(() =>
        Promise.resolve(lookupResponse([]))
      );

      const promise = client.lookupBatch(ids);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call should have 150 IDs
      const url1 = mockFetch.mock.calls[0][0];
      const idParam1 = new URL(url1).searchParams.get("id")!;
      expect(idParam1.split(",")).toHaveLength(150);

      // Second call should have 150 IDs
      const url2 = mockFetch.mock.calls[1][0];
      const idParam2 = new URL(url2).searchParams.get("id")!;
      expect(idParam2.split(",")).toHaveLength(150);
    });

    it("should retry on 429 with exponential backoff", async () => {
      // First call: 429, second call: success
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests" })
        .mockResolvedValueOnce(lookupResponse([
          { wrapperType: "track", kind: "podcast", collectionId: 1, collectionName: "Pod", feedUrl: "https://f.xml" } as Partial<AppleLookupResult>,
        ]));

      const promise = client.lookupBatch([1]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it("should retry on 5xx errors", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
        .mockResolvedValueOnce(lookupResponse([
          { wrapperType: "track", kind: "podcast", collectionId: 1, feedUrl: "https://f.xml" } as Partial<AppleLookupResult>,
        ]));

      const promise = client.lookupBatch([1]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it("should return empty array after exhausting retries", async () => {
      // All 3 retries fail with 429
      mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" });

      const promise = client.lookupBatch([1]);
      await vi.runAllTimersAsync();
      const result = await promise;

      // 1 initial + RETRY_MAX retries = 4 calls total (or 3 if initial counts as attempt 1)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(result).toEqual([]);
    });

    it("should filter to podcast results only", async () => {
      mockFetch.mockResolvedValueOnce(lookupResponse([
        { wrapperType: "track", kind: "podcast", collectionId: 1, feedUrl: "https://f.xml" } as Partial<AppleLookupResult>,
        { wrapperType: "artist", kind: "artist", collectionId: 2 } as any,
      ]));

      const promise = client.lookupBatch([1, 2]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].collectionId).toBe(1);
    });

    it("should return empty array for empty input", async () => {
      const result = await client.lookupBatch([]);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("should return results with feedUrl", async () => {
      const results: Partial<AppleLookupResult>[] = [
        {
          wrapperType: "track",
          kind: "podcast",
          collectionId: 42,
          collectionName: "Found Podcast",
          feedUrl: "https://example.com/found.xml",
          artistName: "Searcher",
        },
      ];
      mockFetch.mockResolvedValueOnce(searchResponse(results));

      const promise = client.search("found podcast");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].feedUrl).toBe("https://example.com/found.xml");
      expect(result[0].collectionName).toBe("Found Podcast");
    });

    it("should pass search term and limit as query params", async () => {
      mockFetch.mockResolvedValueOnce(searchResponse([]));

      const promise = client.search("tech podcast", 10);
      await vi.runAllTimersAsync();
      await promise;

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("term")).toBe("tech podcast");
      expect(url.searchParams.get("media")).toBe("podcast");
      expect(url.searchParams.get("limit")).toBe("10");
    });

    it("should default limit to 25", async () => {
      mockFetch.mockResolvedValueOnce(searchResponse([]));

      const promise = client.search("anything");
      await vi.runAllTimersAsync();
      await promise;

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("limit")).toBe("25");
    });

    it("should return empty array on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const promise = client.search("test");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([]);
    });
  });
});
