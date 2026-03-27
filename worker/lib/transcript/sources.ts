import { safeFetch } from "../url-validation";
import type { Env } from "../../types";

export interface TranscriptLookupContext {
  episodeGuid: string;
  episodeTitle: string;
  podcastTitle: string;
  podcastIndexId: string | null;
  feedUrl: string;
  transcriptUrl: string | null;
}

export interface TranscriptSource {
  name: string;
  identifier: string;
  lookup(ctx: TranscriptLookupContext, env: Env): Promise<string | null>;
}

const RssFeedSource: TranscriptSource = {
  name: "RSS Feed",
  identifier: "rss-feed",
  async lookup(ctx) {
    if (!ctx.transcriptUrl) return null;
    try {
      const resp = await safeFetch(ctx.transcriptUrl);
      if (!resp.ok) return null;
      return resp.text();
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "rss_transcript_fetch_failed",
        transcriptUrl: ctx.transcriptUrl,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
      return null;
    }
  },
};

const PodcastIndexTranscriptSource: TranscriptSource = {
  name: "Podcast Index",
  identifier: "podcast-index",
  async lookup(ctx, env) {
    const { PodcastIndexClient } = await import("../podcast-index");
    const { lookupPodcastIndexTranscript } = await import("./podcast-index-source");
    const { fetchTranscript } = await import("./parser");
    const client = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
    const url = await lookupPodcastIndexTranscript(
      client,
      ctx.podcastIndexId,
      ctx.episodeGuid,
      ctx.episodeTitle
    );
    if (!url) return null;
    return fetchTranscript(url);
  },
};

const registeredSources = new Map<string, TranscriptSource>([
  ["rss-feed", RssFeedSource],
  ["podcast-index", PodcastIndexTranscriptSource],
]);

export function getTranscriptSource(identifier: string): TranscriptSource | undefined {
  return registeredSources.get(identifier);
}

export function getAllTranscriptSources(): TranscriptSource[] {
  return Array.from(registeredSources.values());
}
