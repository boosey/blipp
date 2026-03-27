import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Pause,
  Play,
  Ban,
  Archive,
  Trash2,
  ChevronDown,
} from "lucide-react";
import type { EpisodeRefreshJob } from "@/types/admin";
import {
  scopeBadgeStyle,
  SCOPE_LABELS,
  formatDuration,
  formatTime,
  isActive,
  isTerminal,
  overallProgress,
  StatusIcon,
  ElapsedTimer,
} from "./helpers";
import { JobDetail } from "./job-detail";

export interface JobCardProps {
  job: EpisodeRefreshJob;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: string, jobId: string) => void;
}

export function JobCard({ job, expanded, onToggle, onAction }: JobCardProps) {
  const elapsed = job.startedAt
    ? (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime()
    : 0;

  const active = isActive(job.status);
  const pct = overallProgress(job);

  return (
    <div className="rounded-lg border border-white/5 bg-[#1A2942] overflow-hidden">
      {/* Header row */}
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <Badge className="text-[10px] shrink-0" style={scopeBadgeStyle(job.scope)}>
          {SCOPE_LABELS[job.scope] ?? job.scope}
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
            <>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#F59E0B] hover:bg-[#F59E0B]/10" onClick={() => onAction("pause", job.id)}>
                <Pause className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
                <Ban className="h-3 w-3" />
              </Button>
            </>
          )}
          {job.status === "paused" && (
            <>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#10B981] hover:bg-[#10B981]/10" onClick={() => onAction("resume", job.id)}>
                <Play className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
                <Ban className="h-3 w-3" />
              </Button>
            </>
          )}
          {isTerminal(job.status) && !job.archivedAt && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#9CA3AF] hover:bg-white/5" onClick={() => onAction("archive", job.id)}>
              <Archive className="h-3 w-3" />
            </Button>
          )}
          {isTerminal(job.status) && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("delete", job.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Stats row */}
      <div className="px-4 pb-2 text-[10px] text-[#9CA3AF]">
        {job.podcastsCompleted}/{job.podcastsTotal} pods · {job.podcastsWithNewEpisodes} with updates · {job.episodesDiscovered} new eps · {job.prefetchCompleted}/{job.prefetchTotal} prefetch
      </div>

      {/* Progress bar for active jobs */}
      {active && (
        <div className="px-4 pb-3">
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

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
