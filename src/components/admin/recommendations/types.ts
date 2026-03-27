export interface RecommendationConfigItem {
  key: string;
  value: number | boolean;
  description: string;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface EmbeddingsStatus {
  enabled: boolean;
  model: string;
  podcastsWithEmbeddings: number;
  podcastsTotal: number;
  usersWithEmbeddings: number;
  usersTotal: number;
  lastComputeAt: string | null;
}

export interface TopicRow {
  podcastId: string;
  podcastTitle: string;
  podcastImageUrl: string | null;
  categories: string[];
  topicTags: string[];
  topicCount: number;
  computedAt: string;
}

export interface EpisodeTopic {
  episodeId: string;
  episodeTitle: string;
  topicTags: string[];
  computedAt: string;
}
