import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/lib/use-fetch";
import { useAdminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CronRunStatus = "IN_PROGRESS" | "SUCCESS" | "FAILED";
type CronRunLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

type LatestRun = {
  id: string;
  status: CronRunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
};

type CronJob = {
  jobKey: string;
  label: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  latestRun: LatestRun | null;
};

type CronRun = LatestRun & { jobKey: string };

type CronRunLog = {
  id: string;
  level: CronRunLogLevel;
  message: string;
  data: Record<string, unknown> | null;
  timestamp: string;
};

type RunsResponse = { data: CronRun[]; total: number; page: number; pageSize: number };
type LogsResponse = { logs: CronRunLog[] };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERVAL_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
];

const LOG_LEVEL_COLORS: Record<CronRunLogLevel, string> = {
  DEBUG: "text-[#6B7280]",
  INFO: "text-[#3B82F6]",
  WARN: "text-[#F59E0B]",
  ERROR: "text-[#EF4444]",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusDot(job: CronJob): { color: string; title: string } {
  if (!job.enabled) return { color: "bg-[#6B7280]", title: "Disabled" };
  const s = job.latestRun?.status;
  if (!s) return { color: "bg-[#6B7280]", title: "Never run" };
  if (s === "SUCCESS") return { color: "bg-[#10B981]", title: "Last run succeeded" };
  if (s === "FAILED") return { color: "bg-[#EF4444]", title: "Last run failed" };
  return { color: "bg-[#F59E0B]", title: "Running" };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunRow({
  run,
  jobKey,
}: {
  run: CronRun;
  jobKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<CronRunLog[] | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const adminFetch = useAdminFetch();

  const fetchLogs = useCallback(async () => {
    if (logs) {
      setExpanded((v) => !v);
      return;
    }
    setLoadingLogs(true);
    try {
      const res = await adminFetch<LogsResponse>(
        `/cron-jobs/${jobKey}/runs/${run.id}/logs`
      );
      setLogs(res.logs);
      setExpanded(true);
    } finally {
      setLoadingLogs(false);
    }
  }, [adminFetch, jobKey, run.id, logs]);

  const resultSummary = run.result
    ? Object.entries(run.result)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
    : run.errorMessage ?? "—";

  return (
    <div className="border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 py-2.5 px-4 text-xs hover:bg-white/[0.02]">
        {/* Status */}
        <span className="w-16 shrink-0">
          {run.status === "SUCCESS" && (
            <Badge className="bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/10 text-[10px] px-1.5">
              OK
            </Badge>
          )}
          {run.status === "FAILED" && (
            <Badge className="bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444]/10 text-[10px] px-1.5">
              FAIL
            </Badge>
          )}
          {run.status === "IN_PROGRESS" && (
            <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] hover:bg-[#F59E0B]/10 text-[10px] px-1.5">
              RUNNING
            </Badge>
          )}
        </span>

        {/* Time */}
        <span className="w-20 shrink-0 text-[#9CA3AF] tabular-nums">
          {relativeTime(run.startedAt)}
        </span>

        {/* Duration */}
        <span className="w-14 shrink-0 text-[#9CA3AF] font-mono tabular-nums">
          {formatDuration(run.durationMs)}
        </span>

        {/* Result summary */}
        <span className="flex-1 text-[#9CA3AF] truncate font-mono">{resultSummary}</span>

        {/* Logs button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchLogs}
          disabled={loadingLogs}
          className="h-6 px-2 text-[10px] text-[#6B7280] hover:text-[#F9FAFB] hover:bg-white/5 shrink-0"
        >
          {loadingLogs ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Logs
            </>
          )}
        </Button>
      </div>

      {/* Inline log viewer */}
      {expanded && logs !== null && (
        <div className="mx-4 mb-3 bg-[#060E1A] border border-white/5 rounded-md overflow-auto max-h-64">
          {logs.length === 0 ? (
            <p className="text-[#6B7280] text-[10px] p-3 font-mono">No log entries.</p>
          ) : (
            <div className="p-3 space-y-0.5">
              {logs.map((line) => (
                <div key={line.id} className="flex gap-2 font-mono text-[10px] leading-relaxed">
                  <span className="text-[#4B5563] shrink-0 tabular-nums">
                    {new Date(line.timestamp).toISOString().slice(11, 23)}
                  </span>
                  <span
                    className={cn("shrink-0 w-10 uppercase", LOG_LEVEL_COLORS[line.level])}
                  >
                    {line.level}
                  </span>
                  <span className="text-[#D1D5DB]">{line.message}</span>
                  {line.data && (
                    <span className="text-[#6B7280]">
                      {JSON.stringify(line.data)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScheduledJobs() {
  const { data, loading: jobsLoading } = useFetch<{ jobs: CronJob[] }>(
    "/admin/cron-jobs"
  );
  const jobs = data?.jobs ?? [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [localJobs, setLocalJobs] = useState<CronJob[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const adminFetch = useAdminFetch();

  // Seed local state when data loads
  useEffect(() => {
    if (jobs.length > 0) {
      setLocalJobs(jobs);
      if (!selectedKey) setSelectedKey(jobs[0].jobKey);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedJob = localJobs.find((j) => j.jobKey === selectedKey) ?? null;

  // Run history for selected job
  const {
    data: runsData,
    loading: runsLoading,
    refetch: refetchRuns,
  } = useFetch<RunsResponse>(
    selectedKey ? `/admin/cron-jobs/${selectedKey}/runs` : "",
    { enabled: !!selectedKey }
  );
  const runs = runsData?.data ?? [];

  async function patch(jobKey: string, update: { enabled?: boolean; intervalMinutes?: number }) {
    const key = Object.keys(update)[0]!;
    setSaving(`${jobKey}.${key}`);
    try {
      await adminFetch(`/cron-jobs/${jobKey}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      });
      setLocalJobs((prev) =>
        prev.map((j) => (j.jobKey === jobKey ? { ...j, ...update } : j))
      );
    } finally {
      setSaving(null);
    }
  }

  if (jobsLoading && localJobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-white/5 bg-[#0F1D32]">
      {/* Left: job list */}
      <div className="w-56 shrink-0 border-r border-white/5 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">
            Jobs
          </p>
        </div>
        {localJobs.map((job) => {
          const dot = statusDot(job);
          const isSelected = job.jobKey === selectedKey;
          return (
            <button
              key={job.jobKey}
              onClick={() => setSelectedKey(job.jobKey)}
              className={cn(
                "flex flex-col gap-0.5 px-4 py-3 text-left border-b border-white/5 transition-colors",
                isSelected
                  ? "bg-[#3B82F6]/10 border-l-2 border-l-[#3B82F6]"
                  : "hover:bg-white/[0.03]"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2 w-2 rounded-full shrink-0", dot.color)}
                  title={dot.title}
                />
                <span
                  className={cn(
                    "text-xs font-medium truncate",
                    isSelected ? "text-[#F9FAFB]" : "text-[#9CA3AF]"
                  )}
                >
                  {job.label}
                </span>
              </div>
              <span className="text-[10px] text-[#6B7280] pl-4">
                {relativeTime(job.latestRun?.startedAt ?? job.lastRunAt)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedJob ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">
                  {selectedJob.label}
                </h3>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{selectedJob.description}</p>
              </div>

              <div className="flex items-center gap-4">
                {/* Interval */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#9CA3AF]">Every</span>
                  <Select
                    value={String(selectedJob.intervalMinutes)}
                    onValueChange={(v) =>
                      patch(selectedJob.jobKey, { intervalMinutes: Number(v) })
                    }
                    disabled={saving === `${selectedJob.jobKey}.intervalMinutes`}
                  >
                    <SelectTrigger className="w-32 h-7 text-[11px] bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator orientation="vertical" className="h-5 bg-white/10" />

                {/* Enabled toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#9CA3AF]">Enabled</span>
                  <Switch
                    checked={selectedJob.enabled as boolean}
                    onCheckedChange={(v) => patch(selectedJob.jobKey, { enabled: v })}
                    disabled={saving === `${selectedJob.jobKey}.enabled`}
                    className="data-[state=checked]:bg-[#10B981]"
                  />
                </div>

                <Separator orientation="vertical" className="h-5 bg-white/10" />

                {/* Refresh runs */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={refetchRuns}
                  disabled={runsLoading}
                  className="h-7 w-7 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                  title="Refresh run history"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", runsLoading && "animate-spin")} />
                </Button>
              </div>
            </div>

            {/* Run history */}
            <div className="flex-1 overflow-y-auto">
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 sticky top-0 bg-[#0F1D32] z-10">
                <span className="w-16 shrink-0 text-[10px] text-[#6B7280] uppercase tracking-wider">
                  Status
                </span>
                <span className="w-20 shrink-0 text-[10px] text-[#6B7280] uppercase tracking-wider">
                  When
                </span>
                <span className="w-14 shrink-0 text-[10px] text-[#6B7280] uppercase tracking-wider">
                  Duration
                </span>
                <span className="flex-1 text-[10px] text-[#6B7280] uppercase tracking-wider">
                  Result
                </span>
                <span className="w-14 shrink-0" />
              </div>

              {runsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" />
                </div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-[#6B7280]">No runs yet</p>
                  <p className="text-xs text-[#4B5563] mt-1">
                    This job will run automatically based on its interval.
                  </p>
                </div>
              ) : (
                runs.map((run) => (
                  <RunRow key={run.id} run={run} jobKey={selectedJob.jobKey} />
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1">
            <p className="text-sm text-[#6B7280]">Select a job</p>
          </div>
        )}
      </div>
    </div>
  );
}
