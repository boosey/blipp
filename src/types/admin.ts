// ── Shared type contracts for admin frontend/backend ──

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
  recentEpisodes: number;
  feedErrors: number;
}

// ── Dashboard / Command Center ──

export interface SystemHealth {
  overall: "operational" | "degraded" | "critical";
  stages: PipelineStageHealth[];
  activeIssuesCount: number;
}

export interface PipelineStageHealth {
  stage: number;
  name: string;
  completionRate: number; // 0-100
  activeJobs: number;
  status: "healthy" | "warning" | "critical";
}

export interface DashboardStats {
  podcasts: { total: number; trend: number };
  users: { total: number; trend: number };
  episodes: { total: number; trend: number };
  briefings: { total: number; trend: number };
}

export interface CostSummary {
  todaySpend: number;
  yesterdaySpend: number;
  trend: number; // percentage change
  breakdown: { category: string; amount: number; percentage: number }[];
  budgetUsed: number; // 0-100
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  stage: number;
  stageName: string;
  episodeTitle?: string;
  podcastName?: string;
  status: "completed" | "failed" | "in_progress" | "pending";
  processingTime?: number;
  type: string;
}

export interface ActiveIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  rawError?: string; // Original JSON/raw error for debugging
  entityId?: string;
  entityType?: string;
  createdAt: string;
  actionable: boolean;
}

// ── Pipeline Job Lifecycle ──

export type PipelineStage = "TRANSCRIPTION" | "DISTILLATION" | "CLIP_GENERATION";

export type PipelineJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type PipelineStepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "FAILED";

export interface PipelineStep {
  id: string;
  jobId: string;
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  cost?: number;
  retryCount: number;
  createdAt: string;
}

export interface PipelineJob {
  id: string;
  requestId: string;
  episodeId: string;
  durationTier: number;
  status: PipelineJobStatus;
  currentStage: PipelineStage;
  distillationId?: string;
  clipId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Joined data
  episodeTitle?: string;
  podcastTitle?: string;
  podcastImageUrl?: string;
  steps?: PipelineStep[];
}

export interface PipelineStageStats {
  stage: PipelineStage;
  name: string;
  icon: string;
  activeJobs: number;
  successRate: number;
  avgProcessingTime: number;
  todayCost: number;
  perUnitCost: number;
}

export interface PipelineJobFilters {
  currentStage?: PipelineStage;
  status?: PipelineJobStatus;
  requestId?: string;
  dateRange?: DateRange;
  search?: string;
}

// ── Catalog / Podcasts ──

export type FeedHealth = "excellent" | "good" | "fair" | "poor" | "broken";
export type PodcastStatus = "active" | "paused" | "archived";

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
  subscriberCount: number;
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
  transcriptAvailability?: "has_transcript" | "needs_transcription" | "mixed";
  activity?: "today" | "this_week" | "stale" | "inactive";
  categories?: string[];
  search?: string;
}

export interface CatalogStats {
  total: number;
  byHealth: Record<FeedHealth, number>;
  byStatus: Record<PodcastStatus, number>;
  needsAttention: number;
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

export interface AdminEpisodeSummary {
  id: string;
  title: string;
  publishedAt: string;
  durationSeconds?: number;
  pipelineStatus: EpisodePipelineStatus;
  clipCount: number;
}

export type EpisodePipelineStatus =
  | "pending"
  | "transcribing"
  | "distilling"
  | "generating_clips"
  | "completed"
  | "failed";

export interface EpisodePipelineTrace {
  episodeId: string;
  stages: EpisodeStageTrace[];
}

export interface EpisodeStageTrace {
  stage: number;
  name: string;
  status: "completed" | "in_progress" | "pending" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  cost?: number;
  output?: unknown;
}

// ── Briefings ──

export interface AdminBriefing {
  id: string;
  userId: string;
  userEmail: string;
  userTier: string;
  status: string;
  targetMinutes: number;
  actualSeconds?: number;
  audioUrl?: string;
  errorMessage?: string;
  segmentCount: number;
  podcastCount: number;
  fitAccuracy?: number; // 0-100
  createdAt: string;
}

export interface AdminBriefingDetail extends AdminBriefing {
  segments: AdminBriefingSegment[];
  qualityMetrics?: BriefingQualityMetrics;
}

export interface AdminBriefingSegment {
  id: string;
  orderIndex: number;
  podcastTitle: string;
  podcastImageUrl?: string;
  episodeTitle: string;
  clipDuration: number;
  transitionText: string;
}

export interface BriefingQualityMetrics {
  fitAccuracy: number;
  contentCoverage: number;
  segmentBalance: { podcast: string; percentage: number }[];
  transitionQuality: "good" | "needs_review";
}

// ── Users ──

export type UserTier = "FREE" | "PRO" | "PRO_PLUS";
export type UserSegment =
  | "all"
  | "power_users"
  | "at_risk"
  | "trial_ending"
  | "recently_cancelled"
  | "never_active";

export interface AdminUser {
  id: string;
  clerkId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  tier: UserTier;
  isAdmin: boolean;
  status: "active" | "inactive" | "churned";
  briefingCount: number;
  podcastCount: number;
  lastActiveAt?: string;
  createdAt: string;
  badges: string[]; // "power_user", "at_risk", "trial", "anniversary"
}

export interface AdminUserDetail extends AdminUser {
  stripeCustomerId?: string;
  briefingLengthMinutes: number;
  briefingTime: string;
  timezone: string;
  subscriptions: { podcastId: string; podcastTitle: string; createdAt: string }[];
  recentBriefings: AdminBriefing[];
  lifetimeValue?: number;
}

export interface UserSegmentCounts {
  all: number;
  power_users: number;
  at_risk: number;
  trial_ending: number;
  recently_cancelled: number;
  never_active: number;
}

// ── Analytics ──

export interface CostBreakdownData {
  totalCost: number;
  comparison: { amount: number; percentage: number; direction: "up" | "down" };
  dailyCosts: { date: string; stt: number; distillation: number; tts: number; infrastructure: number }[];
  metrics: { perEpisode: number; dailyAvg: number; projectedMonthly: number; budgetStatus: string };
  efficiencyScore: number;
}

export interface UsageTrendsData {
  metrics: { briefings: number; episodes: number; users: number; avgDuration: number };
  trends: { date: string; briefings: number; episodes: number; users: number }[];
  byTier: { tier: string; count: number; percentage: number }[];
  peakTimes: { hour: number; count: number }[];
  topPodcasts: { id: string; title: string; listens: number }[];
}

export interface QualityMetricsData {
  overallScore: number;
  components: {
    timeFitting: number;
    claimCoverage: number;
    transcription: number;
    userSatisfaction: number;
  };
  trend: { date: string; score: number }[];
  recentIssues: { type: string; count: number }[];
}

export interface PipelinePerformanceData {
  throughput: { episodesPerHour: number; trend: number };
  successRates: { stage: number; name: string; rate: number }[];
  processingSpeed: { date: string; avgMs: number }[];
  bottlenecks: { stage: string; issue: string; recommendation: string }[];
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

export interface SubscriptionTierConfig {
  tier: UserTier;
  name: string;
  priceCents: number;
  active: boolean;
  userCount: number;
  highlighted?: boolean;
  stripePriceId?: string;
  limits: {
    briefingsPerWeek: number | null; // null = unlimited
    maxDurationMinutes: number;
    maxPodcasts: number | null;
  };
  features: string[];
}

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  tierAvailability: UserTier[];
  description?: string;
}

// ── Pipeline Control ──

export interface PipelineConfig {
  enabled: boolean;
  minIntervalMinutes: number;
  lastAutoRunAt: string | null;
  stages: Record<number, { enabled: boolean; name: string }>;
}

export interface PipelineTriggerResult {
  enqueued: number;
  skipped: number;
  message: string;
}

// ── Briefing Requests ──

export interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;  // null when useLatest is true
  durationTier: number;      // source of truth for this item's time
  useLatest: boolean;
}

export interface BriefingRequest {
  id: string;
  userId: string;
  status: BriefingRequestStatus;
  targetMinutes: number;
  items: BriefingRequestItem[];
  isTest: boolean;
  briefingId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userEmail?: string;
  jobProgress?: JobProgress[];
}

export type BriefingRequestStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface JobProgress {
  jobId: string;
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  durationTier: number;
  status: PipelineJobStatus;
  currentStage: PipelineStage;
  steps: StepProgress[];
}

export interface StepProgress {
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  durationMs?: number;
  cost?: number;
  errorMessage?: string;
}
