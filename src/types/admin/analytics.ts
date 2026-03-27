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
