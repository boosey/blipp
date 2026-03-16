export interface FeedItem {
  id: string;
  source: "SUBSCRIPTION" | "ON_DEMAND";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  errorMessage: string | null;
  listened: boolean;
  listenedAt: string | null;
  durationTier: number;
  createdAt: string;
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
  };
  episode: {
    id: string;
    title: string;
    publishedAt: string;
    durationSeconds: number | null;
  };
  briefing: {
    id: string;
    clip: {
      audioUrl: string;
      actualSeconds: number | null;
    };
    adAudioUrl: string | null;
  } | null;
}

export interface FeedCounts {
  total: number;
  unlistened: number;
  pending: number;
}
