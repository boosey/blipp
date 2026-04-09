import { RefreshCw, Loader2, Play } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type CronJob,
  type CronRun,
  INTERVAL_OPTIONS,
  JOB_SETTINGS,
} from "./types";
import { RunRow } from "./run-row";

export interface JobDetailPanelProps {
  job: CronJob;
  runs: CronRun[];
  runsLoading: boolean;
  refetchRuns: () => void;
  saving: string | null;
  configEntries: { key: string; value: unknown }[];
  onPatch: (jobKey: string, update: { enabled?: boolean; intervalMinutes?: number }) => void;
  onPatchConfig: (key: string, value: unknown) => void;
  onTrigger: (jobKey: string) => void;
  triggering: boolean;
}

export function JobDetailPanel({
  job,
  runs,
  runsLoading,
  refetchRuns,
  saving,
  configEntries,
  onPatch,
  onPatchConfig,
  onTrigger,
  triggering,
}: JobDetailPanelProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-[#F9FAFB]">
            {job.label}
          </h3>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{job.description}</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Interval */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#9CA3AF]">Every</span>
            <Select
              value={String(job.intervalMinutes)}
              onValueChange={(v) =>
                onPatch(job.jobKey, { intervalMinutes: Number(v) })
              }
              disabled={saving === `${job.jobKey}.intervalMinutes`}
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
              checked={job.enabled as boolean}
              onCheckedChange={(v) => onPatch(job.jobKey, { enabled: v })}
              disabled={saving === `${job.jobKey}.enabled`}
              className="data-[state=checked]:bg-[#10B981]"
            />
          </div>

          <Separator orientation="vertical" className="h-5 bg-white/10" />

          {/* Run Now */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTrigger(job.jobKey)}
            disabled={triggering || !job.enabled}
            className="h-7 text-[11px] text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 gap-1.5"
            title={job.enabled ? "Queue job to run on next cron tick (≤5 min)" : "Enable job first"}
          >
            <Play className={cn("h-3 w-3", triggering && "animate-pulse")} />
            {triggering ? "Queued" : "Run Now"}
          </Button>

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

      {/* Job-specific settings */}
      {JOB_SETTINGS[job.jobKey] && (
        <div className="px-6 py-3 border-b border-white/5 space-y-3">
          <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Settings</p>
          {JOB_SETTINGS[job.jobKey].map((setting) => {
            const value = configEntries.find((c) => c.key === setting.key)?.value;
            return (
              <div key={setting.key} className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#F9FAFB]">{setting.label}</span>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{setting.description}</p>
                </div>
                {setting.type === "boolean" ? (
                  <Switch
                    checked={Boolean(value ?? setting.default)}
                    onCheckedChange={(v) => onPatchConfig(setting.key, v)}
                    disabled={saving === setting.key}
                    className="data-[state=checked]:bg-[#10B981]"
                  />
                ) : (
                  <Input
                    type="number"
                    value={value != null ? Number(value) : Number(setting.default)}
                    onChange={(e) => onPatchConfig(setting.key, Number(e.target.value))}
                    disabled={saving === setting.key}
                    className="w-20 h-7 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono text-center"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

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
            <RunRow key={run.id} run={run} jobKey={job.jobKey} />
          ))
        )}
      </div>
    </>
  );
}
