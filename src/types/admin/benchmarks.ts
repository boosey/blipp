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
