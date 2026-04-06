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
  /** Publication date as ISO string, or null if feed lacks pubDate */
  publishedAt: string | null;
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
  /** Podcast language (e.g., "en-us") from RSS <language> tag */
  language?: string;
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
 * Truncate RSS XML to only the first `maxItems` <item> elements.
 * RSS feeds list episodes as <item>...</item> blocks inside <channel>.
 * Feeds with thousands of episodes blow the XML entity expansion limit.
 * By cutting after the Nth </item> and closing the XML structure, we avoid
 * parsing episodes we'll never use (feed-refresh only keeps the latest N).
 */
export function truncateRssItems(xml: string, maxItems: number): string {
  let pos = 0;
  let count = 0;
  const closeTag = "</item>";

  while (count < maxItems) {
    const idx = xml.indexOf(closeTag, pos);
    if (idx === -1) return xml; // fewer items than maxItems — return as-is
    pos = idx + closeTag.length;
    count++;
  }

  // Slice after the Nth </item> and close out the XML structure
  return xml.slice(0, pos) + "\n</channel>\n</rss>";
}

/**
 * Parses an RSS/Atom podcast feed XML string into structured data.
 * Uses fast-xml-parser (Workers-compatible, no DOM dependency).
 * Extracts podcast:transcript URLs from items when present.
 *
 * @param xml - Raw RSS feed XML string
 * @param maxItems - Max items to parse (truncates XML before parsing to avoid entity expansion limits)
 * @returns Parsed feed with metadata and episodes
 * @throws Error if the XML has no recognizable channel/item structure
 */
export function parseRssFeed(xml: string, maxItems?: number): ParsedFeed {
  const toParse = maxItems ? truncateRssItems(xml, maxItems) : xml;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Ensure items is always an array even with a single episode
    isArray: (tagName) =>
      tagName === "item" || tagName === "podcast:transcript",
  });

  const parsed = parser.parse(toParse);
  const channel = parsed?.rss?.channel;

  if (!channel) {
    const preview = toParse.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`Invalid RSS feed: no channel element found. Response preview: ${preview}`);
  }

  const items: unknown[] = channel.item ?? [];

  const episodes: ParsedEpisode[] = [];

  for (const item of items) {
    // Extract transcript URL from podcast:transcript tag
    let transcriptUrl: string | null = null;
    const transcripts = (item as any)["podcast:transcript"];
    if (Array.isArray(transcripts)) {
      // Prefer SRT or VTT formats
      const preferred = transcripts.find((t: any) => {
        const type = (t["@_type"] ?? "").toLowerCase();
        return type.includes("srt") || type.includes("vtt");
      });
      transcriptUrl = (preferred ?? transcripts[0])?.["@_url"] ?? null;
    }

    // Handle guid as object or string — always coerce to string
    const rawGuid = (item as any).guid;
    const guid = String(
      typeof rawGuid === "object" ? rawGuid?.["#text"] ?? "" : rawGuid ?? ""
    );

    const episode: ParsedEpisode = {
      title: String((item as any).title ?? ""),
      description: String((item as any).description ?? (item as any)["itunes:summary"] ?? ""),
      audioUrl: (item as any).enclosure?.["@_url"] ?? "",
      publishedAt: (() => {
        if (!(item as any).pubDate) return null;
        const d = new Date((item as any).pubDate);
        return isNaN(d.getTime()) ? null : d.toISOString();
      })(),
      durationSeconds: parseDuration((item as any)["itunes:duration"]),
      guid,
      transcriptUrl,
    };

    // Validate required fields — skip episodes that are unusable
    if (!episode.guid) continue;
    if (!episode.audioUrl) continue;
    if (!episode.title) episode.title = "Untitled Episode";

    // publishedAt is null when feed lacks pubDate — stored as NULL in DB

    episodes.push(episode);
  }

  return {
    title: channel.title ?? "",
    description: channel.description ?? "",
    imageUrl:
      channel["itunes:image"]?.["@_href"] ??
      channel.image?.url ??
      null,
    author: channel["itunes:author"] ?? channel.author ?? null,
    language: channel.language || undefined,
    episodes,
  };
}
