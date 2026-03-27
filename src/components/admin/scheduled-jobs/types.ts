// ---------------------------------------------------------------------------
// Types & Constants for Scheduled Jobs
// ---------------------------------------------------------------------------

export type CronRunStatus = "IN_PROGRESS" | "SUCCESS" | "FAILED";
export type CronRunLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LatestRun = {
  id: string;
  status: CronRunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
};

export type CronJob = {
  jobKey: string;
  label: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  latestRun: LatestRun | null;
};

export type CronRun = LatestRun & { jobKey: string };

export type CronRunLog = {
  id: string;
  level: CronRunLogLevel;
  message: string;
  data: Record<string, unknown> | null;
  timestamp: string;
};

export type RunsResponse = { data: CronRun[]; total: number; page: number; pageSize: number };
export type LogsResponse = { logs: CronRunLog[] };

export type JobSettingDef = {
  key: string;
  label: string;
  type: "boolean" | "number";
  description: string;
  default: boolean | number;
};

export const INTERVAL_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
];

export const LOG_LEVEL_COLORS: Record<CronRunLogLevel, string> = {
  DEBUG: "text-[#6B7280]",
  INFO: "text-[#3B82F6]",
  WARN: "text-[#F59E0B]",
  ERROR: "text-[#EF4444]",
};

export const JOB_SETTINGS: Record<string, JobSettingDef[]> = {
  "data-retention": [
    { key: "requests.archiving.enabled", label: "Request Archiving", type: "boolean", description: "Delete completed/failed requests older than retention period", default: false },
    { key: "requests.archiving.maxAgeDays", label: "Retention Days", type: "number", description: "Requests older than this are permanently deleted", default: 30 },
  ],
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function statusDot(job: CronJob): { color: string; title: string } {
  if (!job.enabled) return { color: "bg-[#6B7280]", title: "Disabled" };
  const s = job.latestRun?.status;
  if (!s) return { color: "bg-[#6B7280]", title: "Never run" };
  if (s === "SUCCESS") return { color: "bg-[#10B981]", title: "Last run succeeded" };
  if (s === "FAILED") return { color: "bg-[#EF4444]", title: "Last run failed" };
  return { color: "bg-[#F59E0B]", title: "Running" };
}
