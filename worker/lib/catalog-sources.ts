import type { Env } from "../types";

export interface DiscoveredPodcast {
  feedUrl: string;
  title: string;
  description?: string;
  imageUrl?: string;
  author?: string;
  appleId?: string;
  podcastIndexId?: string;
  categories?: { genreId: string; name: string }[];
  appleMetadata?: Record<string, unknown>;
}

export interface CatalogSource {
  name: string;
  identifier: string;
  discover(count: number, env: Env): Promise<DiscoveredPodcast[]>;
  search(query: string, env: Env): Promise<DiscoveredPodcast[]>;
}

/**
 * Maps Podcast Index category names to Apple genre IDs.
 * Used to maintain compatibility with the existing DB category schema (appleGenreId).
 */
const PI_CAT_TO_APPLE_GENRE: Record<string, { genreId: string; name: string }> =
  {
    Arts: { genreId: "1301", name: "Arts" },
    Business: { genreId: "1321", name: "Business" },
    Comedy: { genreId: "1303", name: "Comedy" },
    Education: { genreId: "1304", name: "Education" },
    Fiction: { genreId: "1483", name: "Fiction" },
    Government: { genreId: "1511", name: "Government" },
    Health: { genreId: "1512", name: "Health & Fitness" },
    Fitness: { genreId: "1512", name: "Health & Fitness" },
    History: { genreId: "1487", name: "History" },
    Kids: { genreId: "1305", name: "Kids & Family" },
    Family: { genreId: "1305", name: "Kids & Family" },
    Leisure: { genreId: "1502", name: "Leisure" },
    Music: { genreId: "1310", name: "Music" },
    News: { genreId: "1489", name: "News" },
    Religion: { genreId: "1314", name: "Religion & Spirituality" },
    Spirituality: { genreId: "1314", name: "Religion & Spirituality" },
    Science: { genreId: "1533", name: "Science" },
    Society: { genreId: "1324", name: "Society & Culture" },
    Culture: { genreId: "1324", name: "Society & Culture" },
    Sports: { genreId: "1545", name: "Sports" },
    Technology: { genreId: "1318", name: "Technology" },
    "True Crime": { genreId: "1488", name: "True Crime" },
    TV: { genreId: "1309", name: "TV & Film" },
    Film: { genreId: "1309", name: "TV & Film" },
  };

/** Top-level PI categories to query for diverse trending results */
const TRENDING_CATEGORIES = [
  "Arts",
  "Business",
  "Comedy",
  "Education",
  "Fiction",
  "Government",
  "Health",
  "History",
  "Kids",
  "Leisure",
  "Music",
  "News",
  "Religion",
  "Science",
  "Society",
  "Sports",
  "Technology",
  "True Crime",
  "TV",
];

/**
 * Maps a PodcastIndexFeed's categories to Apple genre IDs.
 * PI feeds have categories as Record<string, string> (id -> name).
 */
function mapPiCategories(
  piCategories: Record<string, string>
): { genreId: string; name: string }[] {
  const seen = new Set<string>();
  const result: { genreId: string; name: string }[] = [];

  for (const catName of Object.values(piCategories)) {
    const mapped = PI_CAT_TO_APPLE_GENRE[catName];
    if (mapped && !seen.has(mapped.genreId)) {
      seen.add(mapped.genreId);
      result.push(mapped);
    }
  }

  return result;
}

// Podcast Index implementation — uses trending by category for diverse results
const PodcastIndexSource: CatalogSource = {
  name: "Podcast Index",
  identifier: "podcast-index",

  async discover(count, env) {
    const { PodcastIndexClient } = await import("./podcast-index");
    const client = new PodcastIndexClient(
      env.PODCAST_INDEX_KEY,
      env.PODCAST_INDEX_SECRET
    );

    const perCategory = Math.min(Math.ceil(count / TRENDING_CATEGORIES.length), 1000);
    const seen = new Map<string, DiscoveredPodcast>();

    // Fetch all categories in parallel
    const results = await Promise.allSettled(
      TRENDING_CATEGORIES.map((cat) => client.trending(perCategory, "en", cat))
    );

    for (let i = 0; i < TRENDING_CATEGORIES.length; i++) {
      const catName = TRENDING_CATEGORIES[i];
      const result = results[i];

      if (result.status !== "fulfilled") {
        console.warn(`[PodcastIndex] Trending failed for ${catName}: ${result.reason}`);
        continue;
      }

      const feeds = result.value;
      const prevSize = seen.size;

      for (const p of feeds) {
        if (!p.url || seen.has(p.url)) continue;
        // Skip non-Latin titles (CJK, Arabic, etc.)
        if (/[\u3000-\u9fff\uac00-\ud7af\u0600-\u06ff]/u.test(p.title)) continue;

        const categories = mapPiCategories(p.categories ?? {});
        // If no categories mapped from feed data, use the query category
        if (categories.length === 0) {
          const mapped = PI_CAT_TO_APPLE_GENRE[catName];
          if (mapped) categories.push(mapped);
        }

        seen.set(p.url, {
          feedUrl: p.url,
          title: p.title,
          description: p.description,
          imageUrl: p.image,
          author: p.author,
          podcastIndexId: String(p.id),
          categories,
        });
      }

      console.log(
        `[PodcastIndex] ${catName}: ${feeds.length} fetched, ${seen.size - prevSize} new | Running: ${seen.size} unique`
      );
    }

    // Also fetch overall trending (no category filter) for general top podcasts
    try {
      const overall = await client.trending(100, "en");
      let added = 0;
      for (const p of overall) {
        if (!p.url || seen.has(p.url)) continue;
        if (/[\u3000-\u9fff\uac00-\ud7af\u0600-\u06ff]/u.test(p.title)) continue;
        seen.set(p.url, {
          feedUrl: p.url,
          title: p.title,
          description: p.description,
          imageUrl: p.image,
          author: p.author,
          podcastIndexId: String(p.id),
          categories: mapPiCategories(p.categories ?? {}),
        });
        added++;
      }
      console.log(`[PodcastIndex] Overall trending: ${overall.length} fetched, ${added} new | Total: ${seen.size} unique`);
    } catch (err) {
      console.warn("[PodcastIndex] Overall trending failed:", err);
    }

    console.log(`[PodcastIndex] Discovery complete: ${seen.size} unique podcasts`);
    return Array.from(seen.values());
  },

  async search(query, env) {
    const { PodcastIndexClient } = await import("./podcast-index");
    const client = new PodcastIndexClient(
      env.PODCAST_INDEX_KEY,
      env.PODCAST_INDEX_SECRET
    );
    const results = await client.searchByTerm(query);
    return results.map((p) => ({
      feedUrl: p.url,
      title: p.title,
      description: p.description,
      imageUrl: p.image,
      author: p.author,
      podcastIndexId: String(p.id),
      categories: mapPiCategories(p.categories ?? {}),
    }));
  },
};

// Apple Podcasts implementation (uses Apple charts + PI for feed URL resolution)
const ApplePodcastsSource: CatalogSource = {
  name: "Apple Podcasts",
  identifier: "apple",

  async discover(count, env) {
    const { ApplePodcastsClient } = await import("./apple-podcasts");
    const { PodcastIndexClient } = await import("./podcast-index");
    const appleClient = new ApplePodcastsClient();
    const piClient = new PodcastIndexClient(
      env.PODCAST_INDEX_KEY,
      env.PODCAST_INDEX_SECRET
    );

    // Apple genre filtering is broken — only fetches global top 100
    const chartEntries = await appleClient.topByGenre("", 100, "us");
    if (chartEntries.length === 0) return [];

    const appleIds = chartEntries.map((e) => Number(e.id));
    const feedMap = await piClient.batchByItunesId(appleIds);
    console.log(
      `[Apple] Resolved ${feedMap.size}/${chartEntries.length} chart entries via Podcast Index`
    );

    const discovered: DiscoveredPodcast[] = [];
    for (const entry of chartEntries) {
      const piFeed = feedMap.get(Number(entry.id));
      if (!piFeed?.url) continue;

      discovered.push({
        feedUrl: piFeed.url,
        title: piFeed.title || entry.name,
        imageUrl: piFeed.image || entry.artworkUrl100,
        author: piFeed.author || entry.artistName,
        appleId: entry.id,
        podcastIndexId: String(piFeed.id),
        categories: entry.genres.map((g) => ({
          genreId: g.genreId,
          name: g.name,
        })),
      });
    }

    return discovered;
  },

  async search(query, env) {
    const { ApplePodcastsClient } = await import("./apple-podcasts");
    const client = new ApplePodcastsClient();
    const results = await client.search(query);
    return results.map((r) => ({
      feedUrl: r.feedUrl,
      title: r.collectionName,
      imageUrl: r.artworkUrl600,
      author: r.artistName,
      appleId: String(r.collectionId),
      categories: (r.genreIds ?? [])
        .filter((id) => id !== "26")
        .map((id) => ({
          genreId: id,
          name: r.genres?.[r.genreIds?.indexOf(id) ?? -1] ?? "",
        })),
    }));
  },
};

const sources = new Map<string, CatalogSource>([
  ["podcast-index", PodcastIndexSource],
  ["apple", ApplePodcastsSource],
]);

export function getCatalogSource(identifier: string): CatalogSource {
  const source = sources.get(identifier);
  if (!source) throw new Error(`Unknown catalog source: ${identifier}`);
  return source;
}
