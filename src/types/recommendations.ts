export interface CuratedEpisodeItem {
  episode: {
    id: string;
    title: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  };
  podcast: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
    categories?: string[];
  };
  score: number;
  reasons: string[];
}

export interface CuratedRow {
  title: string;
  type: "episodes" | "podcasts";
  items: CuratedEpisodeItem[];
}

export interface PodcastSuggestion {
  podcast: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
    episodeCount: number;
    subscriberCount: number;
    categories: string[];
  };
  matchedEpisodeCount: number;
  topReasons: string[];
  score: number;
}

export interface CuratedResponse {
  rows: CuratedRow[];
  podcastSuggestions: PodcastSuggestion[];
}

export interface EpisodeBrowseItem {
  episode: {
    id: string;
    title: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  };
  podcast: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
    categories?: string[];
  };
}

export interface EpisodeBrowseResponse {
  episodes: EpisodeBrowseItem[];
  total: number;
  page: number;
  pageSize: number;
}
