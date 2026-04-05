// ── AI Model Registry ──

export interface AiModelProviderEntry {
  id: string;
  aiModelId: string;
  provider: string;
  providerLabel: string;
  providerModelId: string | null;
  pricePerMinute: number | null;
  priceInputPerMToken: number | null;
  priceOutputPerMToken: number | null;
  pricePerKChars: number | null;
  isDefault: boolean;
  isAvailable: boolean;
  limits?: Record<string, unknown> | null;
  priceUpdatedAt: string | null;
}

export interface AiModelEntry {
  id: string;
  stages: string[];
  modelId: string;
  label: string;
  developer: string;
  notes: string | null;
  isActive: boolean;
  estMonthlyCosts: Record<string, number | null>;
  providers: AiModelProviderEntry[];
}

// ── AI Service Errors ──

export interface AdminAiServiceError {
  id: string;
  service: "stt" | "distillation" | "narrative" | "tts";
  provider: string;
  model: string;
  operation: string;
  correlationId: string;
  jobId?: string;
  stepId?: string;
  episodeId?: string;
  category: string;
  severity: "transient" | "permanent";
  httpStatus?: number;
  errorMessage: string;
  rawResponse?: string;
  requestDurationMs: number;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  resolved: boolean;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  createdAt: string;
}

export interface AiErrorSummary {
  totalErrors: number;
  byService: Record<string, number>;
  byProvider: Record<string, number>;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  errorRate: {
    last1h: number;
    last24h: number;
    last7d: number;
  };
  topErrors: Array<{
    errorMessage: string;
    count: number;
    lastSeen: string;
  }>;
  since: string;
}

// ── Recommendations ──

export interface AdminRecommendationStats {
  usersWithProfiles: number;
  podcastsWithProfiles: number;
  cacheHitRate: number;
  lastComputeAt: string | null;
}

export interface AdminRecommendationUserRow {
  id: string;
  name: string | null;
  email: string;
  imageUrl?: string;
  hasProfile: boolean;
  listenCount: number;
  categoryCount: number;
  subscriptionCount: number;
  cacheAge: number | null;
  cachedRecommendationCount: number;
  profileComputedAt: string | null;
}

export interface AdminRecommendationUserDetail {
  id: string;
  name: string | null;
  email: string;
  imageUrl?: string;
  subscriptionCount: number;
  favoriteCount: number;
  profile: {
    categoryWeights: Record<string, number>;
    listenCount: number;
    computedAt: string;
  } | null;
  cache: {
    computedAt: string;
    recommendations: {
      podcast: {
        id: string;
        title: string;
        author: string;
        imageUrl: string | null;
        categories: string[];
        episodeCount: number;
      };
      score: number;
      reasons: string[];
    }[];
  } | null;
}

export interface AdminPodcastProfile {
  id: string;
  podcastId: string;
  podcastTitle: string;
  podcastImageUrl: string | null;
  categories: string[];
  categoryWeights: Record<string, number>;
  popularity: number;
  freshness: number;
  subscriberCount: number;
  computedAt: string;
}
