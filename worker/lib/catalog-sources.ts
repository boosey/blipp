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

// Podcast Index implementation
const PodcastIndexSource: CatalogSource = {
  name: "Podcast Index",
  identifier: "podcast-index",

  async discover(count, env) {
    const { PodcastIndexClient } = await import("./podcast-index");
    const client = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
    const results = await client.trending(count);
    return results.map((p) => ({
      feedUrl: p.url,
      title: p.title,
      description: p.description,
      imageUrl: p.image,
      author: p.author,
      podcastIndexId: String(p.id),
    }));
  },

  async search(query, env) {
    const { PodcastIndexClient } = await import("./podcast-index");
    const client = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
    const results = await client.searchByTerm(query);
    return results.map((p) => ({
      feedUrl: p.url,
      title: p.title,
      description: p.description,
      imageUrl: p.image,
      author: p.author,
      podcastIndexId: String(p.id),
    }));
  },
};

// Apple Podcasts implementation
const ApplePodcastsSource: CatalogSource = {
  name: "Apple Podcasts",
  identifier: "apple",

  async discover(count, env) {
    const { ApplePodcastsClient } = await import("./apple-podcasts");
    const client = new ApplePodcastsClient();

    const chartEntries = await client.topAllGenres(count, "us");
    if (chartEntries.length === 0) return [];

    const appleIds = chartEntries.map((e) => Number(e.id));
    const lookupResults = await client.lookupBatch(appleIds);

    const lookupMap = new Map(
      lookupResults.map((r) => [String(r.collectionId), r])
    );

    const discovered: DiscoveredPodcast[] = [];
    for (const entry of chartEntries) {
      const lookup = lookupMap.get(entry.id);
      if (!lookup?.feedUrl) continue;

      discovered.push({
        feedUrl: lookup.feedUrl,
        title: lookup.collectionName || entry.name,
        imageUrl: lookup.artworkUrl600 || entry.artworkUrl100,
        author: lookup.artistName || entry.artistName,
        appleId: entry.id,
        categories: entry.genres.map((g) => ({
          genreId: g.genreId,
          name: g.name,
        })),
        appleMetadata: lookup as unknown as Record<string, unknown>,
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
