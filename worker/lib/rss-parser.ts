import { XMLParser } from "fast-xml-parser";

/**
 * Parsed episode from an RSS feed.
 */
export interface ParsedEpisode {
  /** Episode title */
  title: string;
  /** Episode description/summary */
  description: string;
  /** Direct URL to the audio file */
  audioUrl: string;
  /** Publication date as ISO string */
  publishedAt: string;
  /** Episode duration in seconds, or null if not parseable */
  durationSeconds: number | null;
  /** Episode GUID */
  guid: string;
  /** URL to transcript file (VTT/SRT), if available via podcast:transcript tag */
  transcriptUrl: string | null;
}

/**
 * Parsed podcast feed metadata and episodes.
 */
export interface ParsedFeed {
  /** Podcast title */
  title: string;
  /** Podcast description */
  description: string;
  /** Podcast artwork URL */
  imageUrl: string | null;
  /** Podcast author */
  author: string | null;
  /** Parsed episodes */
  episodes: ParsedEpisode[];
}

/**
 * Parses a duration string into seconds.
 * Accepts either a raw number of seconds or HH:MM:SS / MM:SS format.
 *
 * @param raw - Duration as string (e.g., "3600", "1:00:00", "45:30")
 * @returns Duration in seconds, or null if unparseable
 */
export function parseDuration(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;

  const str = String(raw).trim();

  // Pure numeric — treat as seconds
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // HH:MM:SS or MM:SS format
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return null;
}

/**
 * Parses an RSS/Atom podcast feed XML string into structured data.
 * Uses fast-xml-parser (Workers-compatible, no DOM dependency).
 * Extracts podcast:transcript URLs from items when present.
 *
 * @param xml - Raw RSS feed XML string
 * @returns Parsed feed with metadata and episodes
 * @throws Error if the XML has no recognizable channel/item structure
 */
export function parseRssFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Ensure items is always an array even with a single episode
    isArray: (tagName) =>
      tagName === "item" || tagName === "podcast:transcript",
  });

  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;

  if (!channel) {
    throw new Error("Invalid RSS feed: no channel element found");
  }

  const items: unknown[] = channel.item ?? [];

  const episodes: ParsedEpisode[] = items.map((item: any) => {
    // Extract transcript URL from podcast:transcript tag
    let transcriptUrl: string | null = null;
    const transcripts = item["podcast:transcript"];
    if (Array.isArray(transcripts)) {
      // Prefer SRT or VTT formats
      const preferred = transcripts.find((t: any) => {
        const type = (t["@_type"] ?? "").toLowerCase();
        return type.includes("srt") || type.includes("vtt");
      });
      transcriptUrl = (preferred ?? transcripts[0])?.["@_url"] ?? null;
    }

    // Handle guid as object or string
    const rawGuid = item.guid;
    const guid =
      typeof rawGuid === "object" ? rawGuid?.["#text"] ?? "" : String(rawGuid ?? "");

    return {
      title: item.title ?? "",
      description: item.description ?? item["itunes:summary"] ?? "",
      audioUrl: item.enclosure?.["@_url"] ?? "",
      publishedAt: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
      durationSeconds: parseDuration(item["itunes:duration"]),
      guid,
      transcriptUrl,
    };
  });

  return {
    title: channel.title ?? "",
    description: channel.description ?? "",
    imageUrl:
      channel["itunes:image"]?.["@_href"] ??
      channel.image?.url ??
      null,
    author: channel["itunes:author"] ?? channel.author ?? null,
    episodes,
  };
}
