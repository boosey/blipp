// ── Common ──

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface SortOption {
  field: string;
  direction: "asc" | "desc";
}

export interface DateRange {
  from: string; // ISO date
  to: string;
}

// ── Feed Refresh ──

export interface FeedRefreshSummary {
  lastRunAt: string | null;
  podcastsRefreshed: number;
  totalPodcasts: number;
  totalEpisodes: number;
  recentEpisodes: number;
  prefetchedTranscripts: number;
  prefetchedAudio: number;
  feedErrors: number;
}

// ── Configuration ──

export interface PlatformConfigEntry {
  id: string;
  key: string;
  value: unknown;
  description?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface ConfigCategory {
  name: string;
  icon: string;
  keys: string[];
}

export interface DurationTier {
  minutes: number;
  cacheHitRate: number;
  clipsGenerated: number;
  storageCost: number;
  usageFrequency: number;
}

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string;
}

// ── Pipeline Control ──

export interface PipelineConfig {
  enabled: boolean;
  stages: Record<string, { enabled: boolean; name: string }>;
}

export interface PipelineTriggerResult {
  enqueued: number;
  skipped: number;
  message: string;
}
