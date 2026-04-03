export interface FeedItem {
  id: string;
  requestId: string | null;
  source: "SUBSCRIPTION" | "ON_DEMAND" | "SHARED";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED";
  errorMessage: string | null;
  listened: boolean;
  listenedAt: string | null;
  playbackPositionSeconds: number | null;
  durationTier: number;
  createdAt: string;
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
    podcastIndexId: string | null;
  };
  episode: {
    id: string;
    title: string;
    publishedAt: string;
    durationSeconds: number | null;
  };
  episodeVote: number;
  briefing: {
    id: string;
    clip: {
      audioUrl: string;
      actualSeconds: number | null;
      previewText: string | null;
      voiceDegraded?: boolean;
    };
    adAudioUrl: string | null;
  } | null;
}

export type FeedFilter = "all" | "new" | "subscription" | "on_demand" | "creating";

export interface FeedCounts {
  total: number;
  unlistened: number;
  pending: number;
}
