import type { ActivityEvent } from "./dashboard";

// ── Catalog / Podcasts ──

export type FeedHealth = "excellent" | "good" | "fair" | "poor" | "broken";
export type PodcastStatus = "active" | "paused" | "archived" | "pending_deletion";

export interface AppleMetadata {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  feedUrl: string;
  releaseDate?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  trackCount?: number;
  country?: string;
  primaryGenreName?: string;
  genreIds?: string[];
  genres?: string[];
  contentAdvisoryRating?: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  appleGenreId: string;
  podcastCount: number;
}

export interface AdminPodcast {
  id: string;
  title: string;
  description?: string;
  feedUrl: string;
  imageUrl?: string;
  author?: string;
  categories: string[];
  lastFetchedAt?: string;
  feedHealth?: FeedHealth;
  feedError?: string;
  episodeCount: number;
  status: PodcastStatus;
  source?: string;
  subscriberCount: number;
  appleId?: string;
  language?: string;
  appleMetadata?: AppleMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPodcastDetail extends AdminPodcast {
  episodes: AdminEpisodeSummary[];
  recentPipelineActivity: ActivityEvent[];
}

export interface CatalogFilters {
  health?: FeedHealth[];
  status?: PodcastStatus[];
  source?: string;
  transcriptAvailability?: "has_transcript" | "needs_transcription" | "mixed";
  activity?: "today" | "this_week" | "stale" | "inactive";
  categories?: string[];
  language?: string;
  search?: string;
}

export interface CatalogStats {
  total: number;
  byHealth: Record<FeedHealth, number>;
  byStatus: Record<PodcastStatus, number>;
  bySource: Record<string, number>;
  needsAttention: number;
}

export interface PodcastSourceStats {
  identifier: string;
  name: string;
  podcastCount: number;
  percentage: number;
  episodeCount: number;
  byHealth: Record<string, number>;
  status: string;
}

// ── Episodes ──

export interface AdminEpisode {
  id: string;
  podcastId: string;
  podcastTitle: string;
  podcastImageUrl?: string;
  title: string;
  description?: string;
  audioUrl: string;
  publishedAt: string;
  durationSeconds?: number;
  transcriptUrl?: string;
  pipelineStatus: EpisodePipelineStatus;
  clipCount: number;
  cost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminClipFeedItem {
  id: string;
  userId: string;
  source: string;
  status: string;
  requestId: string | null;
  createdAt: string;
}

export interface AdminClipSummary {
  id: string;
  durationTier: number;
  actualSeconds: number | null;
  status: string;
  audioUrl: string | null;
  feedItems: AdminClipFeedItem[];
}

export interface AdminEpisodeSummary {
  id: string;
  title: string;
  audioUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  transcriptUrl: string | null;
  pipelineStatus: EpisodePipelineStatus;
  clipCount: number;
  totalCost: number | null;
  clips: AdminClipSummary[];
}

export type EpisodePipelineStatus =
  | "pending"
  | "transcribing"
  | "distilling"
  | "generating_clips"
  | "completed"
  | "failed";

// ── Catalog Seed Progress ──

export interface CatalogSeedJob {
  id: string;
  mode: "destructive" | "additive";
  source: string;
  trigger: string;
  status: string;
  podcastsDiscovered: number;
  error: string | null;
  archivedAt: string | null;
  startedAt: string;
  completedAt: string | null;
  _count?: { errors: number };
}

export interface CatalogJobError {
  id: string;
  phase: string;
  message: string;
  podcastId: string | null;
  episodeId: string | null;
  podcastTitle?: string;
  episodeTitle?: string;
  createdAt: string;
}

export interface CatalogSeedJobList {
  data: CatalogSeedJob[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CatalogSeedProgress {
  job: CatalogSeedJob | null;
  podcastsInserted: number;
  errorCounts: { discovery: number; total: number };
  pagination: {
    pageSize: number;
    podcastPage: number;
    podcastTotal: number;
  };
  recentPodcasts: {
    id: string;
    title: string;
    author: string | null;
    imageUrl: string | null;
    categories: string[];
    createdAt: string;
  }[];
  refreshJob?: { id: string; status: string } | null;
}

// ── Episode Refresh Jobs ──

export interface EpisodeRefreshJob {
  id: string;
  scope: string;
  trigger: string;
  status: string;
  podcastsTotal: number;
  podcastsCompleted: number;
  podcastsWithNewEpisodes: number;
  episodesDiscovered: number;
  prefetchTotal: number;
  prefetchCompleted: number;
  error: string | null;
  archivedAt: string | null;
  startedAt: string;
  completedAt: string | null;
  catalogSeedJobId?: string | null;
  _count?: { errors: number };
}

export interface EpisodeRefreshError {
  id: string;
  phase: string;
  message: string;
  podcastId: string | null;
  episodeId: string | null;
  podcastTitle?: string;
  episodeTitle?: string;
  createdAt: string;
}

export interface EpisodeRefreshJobList {
  data: EpisodeRefreshJob[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EpisodeRefreshProgress {
  job: EpisodeRefreshJob | null;
  podcastsWithNewEpisodesDetail: {
    id: string;
    title: string;
    imageUrl: string | null;
    newEpisodeCount: number;
  }[];
  recentEpisodes: {
    id: string;
    title: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    createdAt: string;
    podcast: { title: string; imageUrl: string | null };
  }[];
  recentPrefetch: {
    id: string;
    title: string;
    contentStatus: string;
    updatedAt: string;
    podcast: { title: string; imageUrl: string | null };
  }[];
  prefetchBreakdown: Record<string, number>;
  errorCounts: { feed_scan: number; prefetch: number; total: number };
  pagination: {
    pageSize: number;
    podcastPage: number;
    podcastTotal: number;
    episodePage: number;
    episodeTotal: number;
    prefetchPage: number;
    prefetchTotal: number;
  };
}
