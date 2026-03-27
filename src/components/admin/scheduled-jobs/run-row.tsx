import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/admin-formatters";
import {
  type CronRun,
  type CronRunLog,
  type LogsResponse,
  LOG_LEVEL_COLORS,
  formatDuration,
} from "./types";

export interface RunRowProps {
  run: CronRun;
  jobKey: string;
}

export function RunRow({ run, jobKey }: RunRowProps) {
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
        .join(" \u00b7 ")
    : run.errorMessage ?? "\u2014";

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
