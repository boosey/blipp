import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { useAdminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/admin-formatters";
import {
  type CronJob,
  type RunsResponse,
  statusDot,
} from "@/components/admin/scheduled-jobs";
import { JobDetailPanel } from "@/components/admin/scheduled-jobs";

export default function ScheduledJobs() {
  const { data, loading: jobsLoading } = useFetch<{ jobs: CronJob[] }>(
    "/admin/cron-jobs"
  );
  const jobs = data?.jobs ?? [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [localJobs, setLocalJobs] = useState<CronJob[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const adminFetch = useAdminFetch();

  // Platform config entries for job-specific settings
  const [configEntries, setConfigEntries] = useState<{ key: string; value: unknown }[]>([]);
  const loadConfigs = useCallback(async () => {
    try {
      const res = await adminFetch<{ data: { category: string; entries: { key: string; value: unknown }[] }[] }>("/config");
      setConfigEntries(res.data.flatMap((g) => g.entries));
    } catch {
      // ignore
    }
  }, [adminFetch]);
  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  async function patchConfig(key: string, value: unknown) {
    setSaving(key);
    try {
      await adminFetch(`/config/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
      await loadConfigs();
    } finally {
      setSaving(null);
    }
  }

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

  async function trigger(jobKey: string) {
    setTriggering(true);
    try {
      await adminFetch(`/cron-jobs/${jobKey}/trigger`, { method: "POST" });
      // Clear lastRunAt in local state so UI reflects "pending"
      setLocalJobs((prev) =>
        prev.map((j) => (j.jobKey === jobKey ? { ...j, lastRunAt: null } : j))
      );
    } finally {
      setTriggering(false);
    }
  }

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
          <JobDetailPanel
            job={selectedJob}
            runs={runs}
            runsLoading={runsLoading}
            refetchRuns={refetchRuns}
            saving={saving}
            configEntries={configEntries}
            onPatch={patch}
            onPatchConfig={patchConfig}
            onTrigger={trigger}
            triggering={triggering}
          />
        ) : (
          <div className="flex items-center justify-center flex-1">
            <p className="text-sm text-[#6B7280]">Select a job</p>
          </div>
        )}
      </div>
    </div>
  );
}
