import type { DateRange } from "./common";

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

// ── Briefing Requests ──

export interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;
  durationTier: number;
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
