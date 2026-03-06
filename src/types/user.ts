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
}

/** Episode summary for listing */
export interface EpisodeSummary {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  durationSeconds: number | null;
}

/** Briefing request as seen by the user */
export interface UserRequest {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  targetMinutes: number;
  createdAt: string;
  briefingId: string | null;
  podcastTitle: string | null;
  podcastImageUrl: string | null;
  episodeTitle: string | null;
}

/** User-friendly status label */
export type RequestStatusLabel = "Creating" | "Complete" | "Error";

export function toStatusLabel(status: UserRequest["status"]): RequestStatusLabel {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating";
    case "COMPLETED":
      return "Complete";
    case "FAILED":
      return "Error";
  }
}
