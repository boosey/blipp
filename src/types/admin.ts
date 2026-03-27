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
  totalEpisodes: number;
  recentEpisodes: number;
  prefetchedTranscripts: number;
  prefetchedAudio: number;
  feedErrors: number;
}

// ── Dashboard / Command Center ──

export interface SystemHealth {
  overall: "operational" | "degraded" | "critical";
  stages: PipelineStageHealth[];
  activeIssuesCount: number;
}

export interface PipelineStageHealth {
  stage: string;
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
  stage: string;
  stageName: string;
  episodeTitle?: string;
  podcastName?: string;
  status: "completed" | "failed" | "in_progress" | "pending";
  processingTime?: number;
  type: string;
  jobId?: string;
  requestId?: string;
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
  jobId?: string;
  requestId?: string;
}

// ── Pipeline Job Lifecycle ──

export type PipelineStage = "TRANSCRIPTION" | "DISTILLATION" | "CLIP_GENERATION" | "NARRATIVE_GENERATION" | "AUDIO_GENERATION" | "BRIEFING_ASSEMBLY";

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
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
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
  dismissedAt?: string | null;
  // Joined data
  episodeTitle?: string;
  episodeDurationSeconds?: number;
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

// ── Briefings (per-user wrapper around shared Clip) ──

export interface AdminBriefing {
  id: string;
  userId: string;
  userEmail: string;
  userPlan: string;
  clipId: string;
  durationTier: number;
  clipStatus: string;
  actualSeconds?: number;
  audioUrl?: string;
  adAudioUrl?: string;
  episodeTitle?: string;
  episodeDurationSeconds?: number;
  podcastTitle?: string;
  podcastImageUrl?: string;
  feedItemCount: number;
  createdAt: string;
}

export interface BriefingPipelineStep {
  stage: string;
  status: string;
  cached: boolean;
  durationMs?: number;
  cost?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AdminBriefingDetail {
  id: string;
  userId: string;
  userEmail: string;
  userPlan: string;
  clipId: string;
  adAudioUrl?: string;
  adAudioKey?: string;
  createdAt: string;
  clip: {
    id: string;
    durationTier: number;
    status: string;
    actualSeconds?: number;
    audioUrl?: string;
    wordCount?: number;
    episodeTitle?: string;
    episodeDurationSeconds?: number;
    podcastTitle?: string;
    podcastId?: string;
    podcastImageUrl?: string;
  };
  pipelineSteps?: BriefingPipelineStep[];
  feedItems: {
    id: string;
    status: string;
    listened: boolean;
    source: string;
    createdAt: string;
  }[];
}

// ── Users ──

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
  plan: { id: string; name: string; slug: string };
  isAdmin: boolean;
  status: "active" | "inactive" | "churned";
  briefingCount: number;
  podcastCount: number;
  lastActiveAt?: string;
  createdAt: string;
  badges: string[]; // "power_user", "at_risk", "trial", "anniversary"
}

export interface AdminFeedItem {
  id: string;
  status: string;
  source: string;
  durationTier: number;
  listened: boolean;
  podcastTitle?: string;
  podcastImageUrl?: string;
  episodeTitle?: string;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  stripeCustomerId?: string;
  feedItemCount: number;
  subscriptions: { podcastId: string; podcastTitle: string; durationTier: number; createdAt: string }[];
  recentFeedItems: AdminFeedItem[];
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
  metrics: { perEpisode: number; dailyAvg: number; projectedMonthly: number };

}

export interface UsageTrendsData {
  metrics: { feedItems: number; episodes: number; users: number; avgDuration: number };
  trends: { date: string; feedItems: number; episodes: number; users: number }[];
  byPlan: { plan: string; count: number; percentage: number }[];
  peakTimes: { hour: number; count: number }[];
  topPodcasts: { id: string; title: string; listens: number }[];
}

export interface QualityMetricsData {
  overallScore: number;
  components: {
    timeFitting: number;
    claimCoverage: number;
    transcription: number;
    userSatisfaction?: number;
  };
  trend: { date: string; score: number }[];
  recentIssues: { type: string; count: number }[];
}

export interface PipelinePerformanceData {
  throughput: { episodesPerHour: number; trend: number };
  successRates: { stage: string; name: string; rate: number }[];
  processingSpeed: { date: string; avgMs: number }[];
  bottlenecks: { stage: string; issue: string; recommendation: string }[];
}

export interface ModelCostData {
  models: {
    model: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }[];
  byStage: {
    stage: string;
    stageName: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }[];
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
  podcastTitle?: string | null;
  episodeTitle?: string | null;
  totalCost?: number;
  jobProgress?: JobProgress[];
}

export type BriefingRequestStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DeletePreviewRelatedRequest {
  id: string;
  status: BriefingRequestStatus;
  createdAt: string;
  userName: string;
  episodeTitle: string | null;
  podcastTitle: string | null;
}

export interface DeletePreviewImpact {
  requestCount: number;
  jobCount: number;
  feedItemCount: number;
  briefingCount: number;
  workProductCount: number;
  clipCount: number;
  r2ObjectCount: number;
}

export interface DeletePreview {
  subjectRequest: { id: string; status: BriefingRequestStatus; createdAt: string };
  relatedRequests: DeletePreviewRelatedRequest[];
  impactSummary: DeletePreviewImpact;
}

export interface JobProgress {
  jobId: string;
  episodeId: string;
  episodeTitle: string;
  episodeDurationSeconds?: number;
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
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  workProducts?: WorkProductSummary[];
  events?: PipelineEventSummary[];
}

// ── Work Products ──

export type WorkProductType =
  | "TRANSCRIPT"
  | "CLAIMS"
  | "NARRATIVE"
  | "AUDIO_CLIP"
  | "BRIEFING_AUDIO";

export interface WorkProductSummary {
  id: string;
  type: WorkProductType;
  r2Key: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Pipeline Events ──

export type PipelineEventLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface PipelineEventSummary {
  id: string;
  level: PipelineEventLevel;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

// ── STT Benchmark ──

export type SttExperimentStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type SttResultStatus = "PENDING" | "RUNNING" | "POLLING" | "COMPLETED" | "FAILED";

export interface SttExperiment {
  id: string;
  name: string;
  status: SttExperimentStatus;
  config: { models: string[]; speeds: number[]; episodeIds: string[] };
  totalTasks: number;
  doneTasks: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SttBenchmarkResult {
  id: string;
  experimentId: string;
  episodeId: string;
  model: string;
  provider?: string;
  speed: number;
  status: SttResultStatus;
  costDollars?: number;
  latencyMs?: number;
  wer?: number;
  wordCount?: number;
  refWordCount?: number;
  r2AudioKey?: string;
  r2TranscriptKey?: string;
  r2RefTranscriptKey?: string;
  pollingId?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  // Joined data
  episodeTitle?: string;
  podcastTitle?: string;
}

export interface SttResultsGrid {
  model: string;
  provider: string;
  speed: number;
  avgWer: number;
  avgCost: number;
  avgLatency: number;
  completedCount: number;
  failedCount: number;
}

export interface SttEligibleEpisode {
  id: string;
  title: string;
  podcastTitle: string;
  podcastImageUrl?: string;
  durationSeconds?: number;
  transcriptUrl?: string;
  hasDistillationTranscript: boolean;
}

// ── Claims Benchmark ──

export type ClaimsExperimentStatus =
  | "PENDING"
  | "RUNNING"
  | "JUDGING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ClaimsExperiment {
  id: string;
  name: string;
  status: ClaimsExperimentStatus;
  baselineModelId: string;
  baselineProvider: string;
  judgeModelId: string;
  judgeProvider: string;
  config: {
    models: { modelId: string; provider: string }[];
    episodeIds: string[];
  };
  totalTasks: number;
  doneTasks: number;
  totalJudgeTasks: number;
  doneJudgeTasks: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ClaimsBenchmarkResult {
  id: string;
  experimentId: string;
  episodeId: string;
  model: string;
  provider: string;
  isBaseline: boolean;
  status: string;
  claimCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  costDollars?: number;
  latencyMs?: number;
  coverageScore?: number;
  weightedCoverageScore?: number;
  hallucinations?: number;
  judgeStatus?: string;
  r2ClaimsKey?: string;
  r2JudgeKey?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  episodeTitle?: string;
  podcastTitle?: string;
}

export interface ClaimsResultsGrid {
  model: string;
  provider: string;
  avgCoverage: number;
  avgWeightedCoverage: number;
  avgHallucinations: number;
  avgClaimCount: number;
  avgCost: number;
  avgLatency: number;
  completedCount: number;
  failedCount: number;
}

export interface ClaimsEligibleEpisode {
  id: string;
  title: string;
  podcastTitle: string;
  podcastImageUrl?: string;
  durationSeconds?: number;
  transcriptSizeBytes?: number;
}

export interface ClaimsJudgeVerdict {
  baselineIndex: number;
  status: "COVERED" | "PARTIALLY_COVERED" | "MISSING";
  matchedCandidateIndex: number | null;
  reason: string;
}

export interface ClaimsJudgeHallucination {
  candidateIndex: number;
  reason: string;
}

export interface ClaimsJudgeOutput {
  verdicts: ClaimsJudgeVerdict[];
  hallucinations: ClaimsJudgeHallucination[];
  coverageScore: number;
  weightedCoverageScore: number;
}

// ── Plans ──

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  // Limits
  briefingsPerWeek: number | null;
  maxDurationMinutes: number;
  maxPodcastSubscriptions: number | null;
  pastEpisodesLimit: number | null;
  // Content Delivery
  onDemandRequestsPerWeek: number | null;
  outputFormats: string[];
  transcriptAccess: boolean;
  refreshLatencyTier: string;
  dailyDigest: boolean;
  weeklyRecap: boolean;
  narrativeDepthTier: string;
  episodeHighlightClips: boolean;
  // Pipeline & Processing
  aiModelTier: string;
  ttsModelTier: string;
  sttModelTier: string;
  customInstructions: boolean;
  retryBudget: number;
  concurrentPipelineJobs: number;
  // Feature flags
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
  researchMode: boolean;
  crossPodcastSynthesis: boolean;
  // Library & Discovery
  topicTracking: boolean;
  customCollections: boolean;
  searchBriefings: boolean;
  catalogAccess: string;
  savedSearches: number | null;
  rssExport: boolean;
  apiAccess: boolean;
  // Personalization
  tonePresets: boolean;
  languageSupport: string[];
  focusTopics: boolean;
  skipTopics: boolean;
  briefingIntro: boolean;
  maxStorageDays: number | null;
  offlineAccess: boolean;
  publicSharing: boolean;
  interactiveBriefing: boolean;
  // Billing
  priceCentsMonthly: number;
  priceCentsAnnual: number | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  stripeProductId: string | null;
  trialDays: number;
  allowedVoicePresetIds: string[];
  // Display
  features: string[];
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  _count: { users: number };
}

// ── AI Model Registry ──

export interface AiModelProviderEntry {
  id: string;
  aiModelId: string;
  provider: string;
  providerLabel: string;
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
  stage: string;
  modelId: string;
  label: string;
  developer: string;
  notes: string | null;
  isActive: boolean;
  providers: AiModelProviderEntry[];
}

// ── AI Service Errors ──

/** AI service error record for the admin dashboard. */
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

/** Summary of AI errors for the admin dashboard. */
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

// ── Catalog Seed Progress ──

export interface CatalogSeedJob {
  id: string;
  mode: "destructive" | "additive";
  source: string; // "apple" | "podcast-index" | "manual"
  trigger: string; // "admin" | "script" | "cron"
  status: string; // pending | discovering | upserting | complete | failed | cancelled
  podcastsDiscovered: number;
  error: string | null;
  archivedAt: string | null;
  startedAt: string;
  completedAt: string | null;
  _count?: { errors: number };
}

export interface CatalogJobError {
  id: string;
  phase: string; // "discovery"
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

// ── Voice Presets ──

export interface VoicePresetProviderConfig {
  voice?: string;
  instructions?: string;
  speed?: number;
}

export interface VoicePresetConfig {
  openai?: VoicePresetProviderConfig;
  groq?: { voice?: string };
  cloudflare?: Record<string, unknown>;
  [provider: string]: unknown;
}

export interface VoiceCharacteristics {
  gender?: "female" | "male" | "neutral";
  tone?: "warm" | "calm" | "energetic" | "neutral";
  pace?: "steady" | "fast" | "slow";
}

export interface VoicePresetEntry {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  config: VoicePresetConfig;
  voiceCharacteristics: VoiceCharacteristics | null;
  createdAt: string;
  updatedAt: string;
}

/** Slim shape returned by GET /api/voice-presets (public endpoint). */
export interface VoicePresetOption {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
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

// ── Prompt Versioning ──

export interface PromptVersionEntry {
  id: string;
  stage: string;
  version: number;
  label: string | null;
  values: Record<string, string>;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  isActive: boolean;
}
