import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Check,
  X,
  Ban,
  Archive,
  ChevronDown,
} from "lucide-react";
import type { CatalogSeedJob } from "@/types/admin";
import {
  sourceBadgeStyle,
  SOURCE_LABELS,
  formatDuration,
  formatTime,
  isActive,
  isTerminal,
  discoveryProgress,
} from "./helpers";
import { JobDetail } from "./job-detail";

function StatusIcon({ status }: { status: string }) {
  if (isActive(status)) return <Loader2 className="h-4 w-4 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-4 w-4 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "failed") return <div className="h-4 w-4 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "cancelled") return <div className="h-4 w-4 rounded-full bg-[#6B7280] flex items-center justify-center"><Ban className="h-2.5 w-2.5 text-white" /></div>;
  return <div className="h-4 w-4 rounded-full border-2 border-[#9CA3AF]/30" />;
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="text-xs text-[#9CA3AF]">{formatDuration(elapsed)}</span>;
}

export interface JobCardProps {
  job: CatalogSeedJob;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: string, jobId: string) => void;
}

export function JobCard({ job, expanded, onToggle, onAction }: JobCardProps) {
  const elapsed = job.startedAt
    ? (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime()
    : 0;

  const active = isActive(job.status);
  const pct = discoveryProgress(job);

  return (
    <div className="rounded-lg border border-white/5 bg-[#1A2942] overflow-hidden">
      {/* Header row */}
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <Badge className="text-[10px] shrink-0" style={sourceBadgeStyle(job.source)}>
          {SOURCE_LABELS[job.source] ?? job.source}
        </Badge>

        <Badge variant="outline" className="text-[10px] text-[#9CA3AF] border-white/10 shrink-0">
          {job.trigger}
        </Badge>

        <span className="text-xs text-[#9CA3AF] shrink-0">
          {formatTime(job.startedAt)}
          {job.completedAt && ` - ${new Date(job.completedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
        </span>

        <span className="text-xs text-[#9CA3AF] shrink-0">
          {active ? (
            <ElapsedTimer startedAt={job.startedAt} />
          ) : job.completedAt ? (
            formatDuration(elapsed)
          ) : null}
        </span>

        <div className="flex-1" />

        <StatusIcon status={job.status} />

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {active && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
              <Ban className="h-3 w-3" />
            </Button>
          )}
          {isTerminal(job.status) && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#9CA3AF] hover:bg-white/5" onClick={() => onAction("archive", job.id)}>
              <Archive className="h-3 w-3" />
            </Button>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Stats row + progress */}
      <div className="px-4 pb-3">
        <div className="text-[10px] text-[#9CA3AF] mb-1">
          {active ? (
            <span>Processing…</span>
          ) : job.podcastsDiscovered > 0 ? (
            <span>{job.podcastsDiscovered} new</span>
          ) : isTerminal(job.status) ? (
            <span>No new podcasts</span>
          ) : null}
        </div>
        {active && <Progress value={pct} className="h-1.5" />}
      </div>

      {/* Error banner */}
      {job.error && (
        <div className="mx-4 mb-3 rounded border border-[#EF4444]/20 bg-[#EF4444]/5 p-2 text-xs text-[#EF4444]">
          {job.error}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && <JobDetail jobId={job.id} />}
    </div>
  );
}
