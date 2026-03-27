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
  rawError?: string;
  entityId?: string;
  entityType?: string;
  createdAt: string;
  actionable: boolean;
  jobId?: string;
  requestId?: string;
}
