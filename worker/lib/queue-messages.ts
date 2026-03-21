/**
 * Shared queue message type definitions.
 * Both producers (orchestrator, routes) and consumers (queue handlers) import from here.
 */

/** Orchestrator queue — pipeline control messages. */
export interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "job-stage-complete" | "job-failed";
  jobId?: string;
  /** The stage that just completed — used for idempotency in job-stage-complete */
  completedStage?: string;
  correlationId?: string;
  errorMessage?: string;
}

/** Orchestrator-internal type for request items. */
export interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;
  durationTier: number;
  useLatest: boolean;
  voicePresetId?: string;
}

/** Transcription queue. */
export interface TranscriptionMessage {
  jobId: string;
  episodeId: string;
  correlationId?: string;
  type?: "manual";
}

/** Distillation queue. */
export interface DistillationMessage {
  jobId: string;
  episodeId: string;
  correlationId?: string;
  type?: "manual";
}

/** Narrative generation queue. */
export interface NarrativeGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  correlationId?: string;
  type?: "manual";
}

/** Audio generation queue. */
export interface AudioGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  voicePresetId?: string | null;
  correlationId?: string;
  type?: "manual";
}

/** Briefing assembly queue. */
export interface BriefingAssemblyMessage {
  requestId: string;
  correlationId?: string;
  type?: "manual";
}

/** Feed refresh queue. */
export interface FeedRefreshMessage {
  podcastId?: string;
  type?: "manual" | "cron";
  seedJobId?: string;
}

/** Catalog refresh queue. */
export interface CatalogRefreshMessage {
  action: "seed" | "refresh";
  mode?: "destructive" | "additive";
  seedJobId?: string;
}
