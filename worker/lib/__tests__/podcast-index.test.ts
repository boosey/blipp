import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PodcastIndexClient } from "../podcast-index";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Web Crypto for SHA-1 digest
const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(20));
vi.stubGlobal("crypto", {
  subtle: { digest: mockDigest },
});

describe("PodcastIndexClient", () => {
  let client: PodcastIndexClient;

  beforeEach(() => {
    client = new PodcastIndexClient("test-key", "test-secret");
    vi.clearAllMocks();
    mockDigest.mockResolvedValue(new ArrayBuffer(20));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("auth headers", () => {
    it("should include X-Auth-Key and Authorization in requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.searchByTerm("test");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toHaveProperty("X-Auth-Key", "test-key");
      expect(options.headers).toHaveProperty("Authorization");
      expect(options.headers).toHaveProperty("X-Auth-Date");
      expect(options.headers).toHaveProperty("User-Agent", "Blipp/1.0");
    });

    it("should use Web Crypto SHA-1 for the auth hash", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.searchByTerm("test");

      expect(mockDigest).toHaveBeenCalledTimes(1);
      expect(mockDigest.mock.calls[0][0]).toBe("SHA-1");
      // Second arg is encoded bytes from TextEncoder — verify it has buffer-like shape
      const arg = mockDigest.mock.calls[0][1];
      expect(arg).toHaveProperty("byteLength");
      expect(arg.byteLength).toBeGreaterThan(0);
    });

    it("should include the API key in the hash input", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.searchByTerm("test");

      const hashInput = new TextDecoder().decode(mockDigest.mock.calls[0][1]);
      expect(hashInput).toContain("test-key");
      expect(hashInput).toContain("test-secret");
    });
  });

  describe("searchByTerm", () => {
    it("should return feeds from API response", async () => {
      const mockFeeds = [
        {
          id: 1,
          title: "Test Podcast",
          url: "https://example.com/feed.xml",
          description: "A test podcast",
          author: "Test Author",
          image: "https://example.com/image.jpg",
          categories: {},
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "true", feeds: mockFeeds }),
      });

      const result = await client.searchByTerm("test");
      expect(result).toEqual(mockFeeds);
    });

    it("should pass search term and max as query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.searchByTerm("javascript podcast", 5);

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("q")).toBe("javascript podcast");
      expect(url.searchParams.get("max")).toBe("5");
    });

    it("should return empty array when feeds is undefined", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "true" }),
      });

      const result = await client.searchByTerm("nonexistent");
      expect(result).toEqual([]);
    });

    it("should throw on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.searchByTerm("test")).rejects.toThrow(
        "Podcast Index API error: 500 Internal Server Error"
      );
    });
  });

  describe("episodesByFeedId", () => {
    it("should return episodes for a feed ID", async () => {
      const mockItems = [
        {
          id: 100,
          title: "Episode 1",
          description: "First episode",
          enclosureUrl: "https://example.com/ep1.mp3",
          datePublished: 1700000000,
          duration: 3600,
          guid: "ep-1",
          feedId: 42,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "true", items: mockItems }),
      });

      const result = await client.episodesByFeedId(42);
      expect(result).toEqual(mockItems);
    });

    it("should pass feed ID and max as query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.episodesByFeedId(42, 5);

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("id")).toBe("42");
      expect(url.searchParams.get("max")).toBe("5");
    });

    it("should use the correct API endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.episodesByFeedId(42);

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.pathname).toBe("/api/1.0/episodes/byfeedid");
    });
  });

  describe("episodesByFeedUrl", () => {
    it("should pass feed URL as query param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await client.episodesByFeedUrl("https://example.com/feed.xml");

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("url")).toBe(
        "https://example.com/feed.xml"
      );
    });

    it("should return items from response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: 1, title: "Ep 1" }],
          }),
      });

      const result = await client.episodesByFeedUrl("https://example.com/f.xml");
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Ep 1");
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        client.episodesByFeedUrl("https://bad.url")
      ).rejects.toThrow("Podcast Index API error: 404");
    });
  });

  describe("trending", () => {
    it("should use the correct endpoint with lang and max", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.trending(10, "en");

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.pathname).toBe("/api/1.0/podcasts/trending");
      expect(url.searchParams.get("max")).toBe("10");
      expect(url.searchParams.get("lang")).toBe("en");
    });

    it("should return trending feeds", async () => {
      const feeds = [{ id: 1, title: "Trending Pod" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds }),
      });

      const result = await client.trending();
      expect(result).toEqual(feeds);
    });

    it("should default to max=20 and lang=en", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ feeds: [] }),
      });

      await client.trending();

      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("max")).toBe("20");
      expect(url.searchParams.get("lang")).toBe("en");
    });
  });
});
