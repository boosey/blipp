import { describe, it, expect } from "vitest";
import { parseRssFeed, parseDuration } from "../rss-parser";

describe("parseDuration", () => {
  it("should parse raw seconds as number", () => {
    expect(parseDuration("3600")).toBe(3600);
  });

  it("should parse HH:MM:SS format", () => {
    expect(parseDuration("1:30:00")).toBe(5400);
  });

  it("should parse MM:SS format", () => {
    expect(parseDuration("45:30")).toBe(2730);
  });

  it("should return null for undefined input", () => {
    expect(parseDuration(undefined)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseDuration("")).toBeNull();
  });

  it("should return null for invalid format", () => {
    expect(parseDuration("invalid")).toBeNull();
  });

  it("should handle numeric input directly", () => {
    expect(parseDuration(120)).toBe(120);
  });
});

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test Podcast</title>
    <description>A great test podcast</description>
    <itunes:author>Test Author</itunes:author>
    <itunes:image href="https://example.com/cover.jpg" />
    <item>
      <title>Episode 1</title>
      <description>First episode description</description>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345678" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>1:30:00</itunes:duration>
      <guid>ep-001</guid>
      <podcast:transcript url="https://example.com/ep1.vtt" type="text/vtt" />
    </item>
    <item>
      <title>Episode 2</title>
      <description>Second episode description</description>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="9876543" />
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>2700</itunes:duration>
      <guid>ep-002</guid>
    </item>
  </channel>
</rss>`;

describe("parseRssFeed", () => {
  it("should parse podcast metadata correctly", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.title).toBe("Test Podcast");
    expect(feed.description).toBe("A great test podcast");
    expect(feed.author).toBe("Test Author");
    expect(feed.imageUrl).toBe("https://example.com/cover.jpg");
  });

  it("should parse episodes with correct fields", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes).toHaveLength(2);

    const ep1 = feed.episodes[0];
    expect(ep1.title).toBe("Episode 1");
    expect(ep1.description).toBe("First episode description");
    expect(ep1.audioUrl).toBe("https://example.com/ep1.mp3");
    expect(ep1.guid).toBe("ep-001");
  });

  it("should parse transcript URL from podcast:transcript tag", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes[0].transcriptUrl).toBe("https://example.com/ep1.vtt");
    expect(feed.episodes[1].transcriptUrl).toBeNull();
  });

  it("should parse HH:MM:SS duration as seconds", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes[0].durationSeconds).toBe(5400); // 1:30:00
  });

  it("should parse raw seconds duration", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes[1].durationSeconds).toBe(2700);
  });

  it("should parse pubDate as ISO string", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes[0].publishedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("should throw on invalid RSS with no channel", () => {
    expect(() => parseRssFeed("<html><body>Not RSS</body></html>")).toThrow(
      "Invalid RSS feed: no channel element found"
    );
  });

  it("should handle feed with no episodes", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Empty Pod</title>
        <description>No episodes yet</description>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    expect(feed.title).toBe("Empty Pod");
    expect(feed.episodes).toHaveLength(0);
  });

  it("should skip episodes with missing guid", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <title>No GUID Episode</title>
          <enclosure url="https://example.com/ep.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    expect(feed.episodes).toHaveLength(0);
  });

  it("should skip episodes with missing enclosure", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <title>No Audio Episode</title>
          <guid>guid-no-audio</guid>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    expect(feed.episodes).toHaveLength(0);
  });

  it("should use 'Untitled Episode' fallback for empty title", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <guid>guid-no-title</guid>
          <enclosure url="https://example.com/ep.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    expect(feed.episodes).toHaveLength(1);
    expect(feed.episodes[0].title).toBe("Untitled Episode");
  });

  it("should fallback to current date for invalid pubDate", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <title>Bad Date Episode</title>
          <guid>guid-bad-date</guid>
          <enclosure url="https://example.com/ep.mp3" type="audio/mpeg" />
          <pubDate>not-a-real-date</pubDate>
        </item>
      </channel>
    </rss>`;

    const before = new Date();
    const feed = parseRssFeed(xml);
    const after = new Date();

    expect(feed.episodes).toHaveLength(1);
    const parsedDate = new Date(feed.episodes[0].publishedAt);
    expect(parsedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(parsedDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("should pass valid episodes through unchanged", () => {
    const feed = parseRssFeed(SAMPLE_RSS);
    expect(feed.episodes).toHaveLength(2);
    expect(feed.episodes[0].title).toBe("Episode 1");
    expect(feed.episodes[0].guid).toBe("ep-001");
    expect(feed.episodes[0].audioUrl).toBe("https://example.com/ep1.mp3");
  });

  it("should filter out invalid episodes and keep valid ones", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Mixed</title>
        <description>Mixed episodes</description>
        <item>
          <title>Valid Episode</title>
          <guid>guid-valid</guid>
          <enclosure url="https://example.com/valid.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
        <item>
          <title>No GUID</title>
          <enclosure url="https://example.com/noguid.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
        <item>
          <title>No Audio</title>
          <guid>guid-no-audio</guid>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
        <item>
          <guid>guid-no-title</guid>
          <enclosure url="https://example.com/notitle.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    // Only 2 valid: "Valid Episode" and the one with guid-no-title (gets "Untitled Episode")
    expect(feed.episodes).toHaveLength(2);
    expect(feed.episodes[0].title).toBe("Valid Episode");
    expect(feed.episodes[0].guid).toBe("guid-valid");
    expect(feed.episodes[1].title).toBe("Untitled Episode");
    expect(feed.episodes[1].guid).toBe("guid-no-title");
  });

  it("should handle guid as object with #text", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <title>Ep</title>
          <guid isPermaLink="false">unique-guid-123</guid>
          <enclosure url="https://example.com/ep.mp3" type="audio/mpeg" />
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRssFeed(xml);
    expect(feed.episodes[0].guid).toBe("unique-guid-123");
  });
});
