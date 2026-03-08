/** Podcast detail as returned by the API */
export interface PodcastDetail {
  id: string;
  title: string;
  description: string | null;
  feedUrl: string;
  imageUrl: string | null;
  author: string | null;
  podcastIndexId: string | null;
  episodeCount: number;
  isSubscribed: boolean;
  subscriptionDurationTier: number | null;
}

/** Episode summary for listing */
export interface EpisodeSummary {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  durationSeconds: number | null;
}
