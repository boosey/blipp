export type ExternalLink =
  | { kind: "apple_episode"; url: string }
  | { kind: "apple_show"; url: string }
  | { kind: "podcast_index"; url: string }
  | { kind: "none" };

export function resolveExternalEpisodeLink(input: {
  episode: { appleEpisodeTrackId: string | null };
  podcast: { appleId: string | null; podcastIndexId: string | null };
}): ExternalLink {
  const { episode, podcast } = input;
  if (podcast.appleId && episode.appleEpisodeTrackId) {
    return {
      kind: "apple_episode",
      url: `https://podcasts.apple.com/podcast/id${podcast.appleId}?i=${episode.appleEpisodeTrackId}`,
    };
  }
  if (podcast.appleId) {
    return {
      kind: "apple_show",
      url: `https://podcasts.apple.com/podcast/id${podcast.appleId}`,
    };
  }
  if (podcast.podcastIndexId) {
    return {
      kind: "podcast_index",
      url: `https://podcastindex.org/podcast/${podcast.podcastIndexId}`,
    };
  }
  return { kind: "none" };
}
