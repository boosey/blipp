export interface AdminDigestDelivery {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  date: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  episodeCount: number;
  totalEpisodes: number;
  completedEpisodes: number;
  actualSeconds: number | null;
  createdAt: string;
  episodes?: AdminDigestEpisode[];
}

export interface AdminDigestEpisode {
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  podcastImageUrl: string | null;
  sourceType: "subscribed" | "favorited" | "recommended";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  entryStage: string | null;
}
