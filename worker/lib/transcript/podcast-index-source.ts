import type { PodcastIndexClient } from "../podcast-index";

/**
 * Looks up a transcript URL for an episode via the Podcast Index API.
 * Matches by GUID (preferred). Returns null if not found or on error.
 * This is a best-effort lookup — errors are swallowed, not thrown.
 */
export async function lookupPodcastIndexTranscript(
  client: PodcastIndexClient,
  podcastIndexId: string | null,
  episodeGuid: string,
  episodeTitle: string
): Promise<string | null> {
  if (!podcastIndexId) return null;

  try {
    const numMatch = podcastIndexId.match(/(\d+)/);
    if (!numMatch) return null;
    const feedId = Number(numMatch[1]);

    const episodes = await client.episodesByFeedId(feedId, 20);

    // Match by GUID (primary)
    const match = episodes.find((ep) => ep.guid === episodeGuid);
    return match?.transcriptUrl ?? null;
  } catch (err) {
    console.error(JSON.stringify({
      level: "warn",
      action: "podcast_index_lookup_failed",
      podcastIndexId,
      episodeGuid,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
    return null;
  }
}
