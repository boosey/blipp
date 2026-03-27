import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Timer,
  DollarSign,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_META, formatDuration, formatCost } from "./pipeline-constants";
import { StatusBadge, DurationTierBadge, StageBadge } from "./pipeline-badges";
import { relativeTime } from "@/lib/admin-formatters";
import type { PipelineJob, PipelineStageStats, PipelineStage } from "@/types/admin";

export interface StageHeaderProps {
  meta: (typeof STAGE_META)[number];
  stats: PipelineStageStats | undefined;
  stageToggle?: React.ReactNode;
  activeCount?: number;
  pendingCount?: number;
}

export function StageHeader({
  meta,
  stats,
  stageToggle,
  activeCount,
  pendingCount,
}: StageHeaderProps) {
  const Icon = meta.icon;
  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex items-center justify-center h-6 w-6 rounded-full"
          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold">{meta.name}</span>
        {activeCount != null && activeCount > 0 && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-medium bg-[#F59E0B]/10 text-[#F59E0B]">
            {activeCount} active
          </span>
        )}
        {pendingCount != null && pendingCount > 0 && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-medium bg-[#9CA3AF]/10 text-[#9CA3AF]">
            {pendingCount} queued
          </span>
        )}
        <div className="ml-auto">{stageToggle}</div>
      </div>
      {stats ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 text-[#F59E0B]" />
            <span className="text-[#9CA3AF]">Active</span>
            <span className="ml-auto font-mono tabular-nums">{stats.activeJobs}</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
            <span className="text-[#9CA3AF]">Rate</span>
            <span className={cn(
              "ml-auto font-mono tabular-nums",
              stats.successRate > 95 ? "text-[#10B981]" : stats.successRate > 80 ? "text-[#F59E0B]" : "text-[#EF4444]"
            )}>
              {stats.successRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3 text-[#3B82F6]" />
            <span className="text-[#9CA3AF]">Avg</span>
            <span className="ml-auto font-mono tabular-nums">{formatDuration(stats.avgProcessingTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-[#10B981]" />
            <span className="text-[#9CA3AF]">Cost</span>
            <span className="ml-auto font-mono tabular-nums">{formatCost(stats.todayCost)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Skeleton className="h-3 w-full bg-white/5" />
          <Skeleton className="h-3 w-3/4 bg-white/5" />
        </div>
      )}
    </div>
  );
}

export interface JobCardProps {
  job: PipelineJob;
  onClick: () => void;
  onDoubleClick?: () => void;
}

export function JobCard({ job, onClick, onDoubleClick }: JobCardProps) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="w-full text-left rounded-md border border-white/5 bg-[#0F1D32] p-2.5 hover:border-white/10 transition-all duration-300 group animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <span className="text-[11px] font-medium text-[#F9FAFB] truncate flex-1 leading-tight">
          {job.episodeTitle ?? job.episodeId}
        </span>
        <ChevronRight className="h-3 w-3 text-[#9CA3AF]/0 group-hover:text-[#9CA3AF]/60 transition-colors shrink-0 mt-0.5" />
      </div>
      {job.podcastTitle && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {job.podcastImageUrl && (
            <img src={job.podcastImageUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
          )}
          <span className="text-[10px] text-[#9CA3AF] truncate">{job.podcastTitle}</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <StatusBadge status={job.status} />
        <div className="flex items-center gap-1.5">
          {job.episodeDurationSeconds != null && (
            <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
              {Math.round(job.episodeDurationSeconds / 60)}m ep
            </span>
          )}
          <DurationTierBadge minutes={job.durationTier} />
          <StageBadge stage={job.currentStage} />
        </div>
      </div>
      <div className="text-[10px] text-[#9CA3AF]/60 font-mono">
        {relativeTime(job.createdAt)}
      </div>
    </button>
  );
}

export function FlowArrow({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-6 shrink-0">
      <div className="h-px w-full" style={{ backgroundColor: `${color}30` }} />
      <div className="relative -mt-[3px]">
        <ArrowRight className="h-[6px] w-[6px]" style={{ color: `${color}60` }} />
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="flex gap-0 h-full">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          {i > 0 && <div className="w-6" />}
          <Skeleton className="h-full bg-white/5 rounded-lg mx-1" />
        </div>
      ))}
    </div>
  );
}
