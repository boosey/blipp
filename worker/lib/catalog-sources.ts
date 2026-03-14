import type { Env } from "../types";

export interface DiscoveredPodcast {
  feedUrl: string;
  title: string;
  description?: string;
  imageUrl?: string;
  author?: string;
  externalId?: string;
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
      externalId: String(p.id),
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
      externalId: String(p.id),
    }));
  },
};

const sources = new Map<string, CatalogSource>([
  ["podcast-index", PodcastIndexSource],
]);

export function getCatalogSource(identifier: string): CatalogSource {
  const source = sources.get(identifier);
  if (!source) throw new Error(`Unknown catalog source: ${identifier}`);
  return source;
}
