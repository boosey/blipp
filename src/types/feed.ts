export interface FeedItem {
  id: string;
  source: "SUBSCRIPTION" | "ON_DEMAND";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
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
  clip: {
    audioUrl: string;
    actualSeconds: number | null;
  } | null;
}

export interface FeedCounts {
  total: number;
  unlistened: number;
  pending: number;
}
