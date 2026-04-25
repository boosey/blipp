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
  subscriptionVoicePresetId: string | null;
  subscriptionPaused: boolean;
  subscriptionPauseReason: string | null;
  userVote: number; // 1 = up, -1 = down, 0 = none
}

/** Episode summary for listing */
export interface EpisodeSummary {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  userVote: number; // 1 = up, -1 = down, 0 = none
  blippStatus: { status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED"; listened: boolean } | null;
  blippCount: number;
}
