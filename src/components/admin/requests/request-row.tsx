import React from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/admin-formatters";
import { toast } from "sonner";
import type {
  BriefingRequest,
  BriefingRequestStatus,
  JobProgress,
} from "@/types/admin";
import { RequestCostSummary, JobProgressTree } from "./job-progress-tree";

const STATUS_STYLES: Record<
  BriefingRequestStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  PROCESSING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
};

export function StatusBadge({ status }: { status: BriefingRequestStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

export function DurationTierBadge({ minutes }: { minutes: number }) {
  return (
    <Badge className="bg-[#8B5CF6]/15 text-[#8B5CF6] text-[9px] font-mono tabular-nums shrink-0">
      {minutes}m
    </Badge>
  );
}

export interface RequestRowProps {
  request: BriefingRequest;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  detail: BriefingRequest | null;
  detailLoading: boolean;
  highlightJobId?: string | null;
  jobRef?: React.RefObject<HTMLDivElement | null>;
  showDebug: boolean;
  showDetails: boolean;
}

export function RequestRow({
  request,
  expanded,
  onToggle,
  onDelete,
  detail,
  detailLoading,
  highlightJobId,
  jobRef,
  showDebug,
  showDetails,
}: RequestRowProps) {
  const itemCount = request.items?.length ?? 0;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <div
        onClick={onToggle}
        className="w-full grid grid-cols-[24px_100px_1fr_80px_60px_80px_80px_100px_32px] gap-3 items-center px-3 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={request.status} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#F9FAFB] truncate">
            {request.userEmail ?? request.userId}
          </span>
          {request.podcastTitle && (
            <span className="text-[10px] text-[#9CA3AF] truncate">
              {request.podcastTitle}{request.episodeTitle ? ` \u2014 ${request.episodeTitle}` : ""}
            </span>
          )}
          {request.isTest && (
            <Badge className="bg-[#F97316]/15 text-[#F97316] text-[9px] shrink-0">
              Test
            </Badge>
          )}
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {request.targetMinutes}m
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {itemCount}
        </div>
        <div className="text-xs text-[#9CA3AF]">
          {request.isTest ? "Test" : "User"}
        </div>
        <div className="text-[10px] text-[#10B981] font-mono tabular-nums">
          {request.totalCost != null ? `$${request.totalCost.toFixed(4)}` : "\u2014"}
        </div>
        <div className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
          {relativeTime(request.createdAt)}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex items-center justify-center h-6 w-6 rounded hover:bg-[#EF4444]/15 text-[#9CA3AF] hover:text-[#EF4444] transition-colors"
          title="Delete request"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pl-10 bg-white/[0.01]">
          {/* Request ID */}
          <div className="flex items-center gap-2 py-1.5 mb-1">
            <span className="text-[10px] text-[#9CA3AF]/60 uppercase tracking-wider">Request</span>
            <code
              className="text-[10px] text-[#9CA3AF] font-mono cursor-pointer hover:text-[#F9FAFB] transition-colors"
              title="Click to copy full ID"
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(request.id); toast.success("Request ID copied"); }}
            >
              {request.id}
            </code>
          </div>
          {/* Items summary */}
          {detailLoading ? (
            <div className="space-y-1 py-2">
              <Skeleton className="h-4 w-full bg-white/5" />
              <Skeleton className="h-4 w-3/4 bg-white/5" />
              <Skeleton className="h-4 w-1/2 bg-white/5" />
            </div>
          ) : detail?.jobProgress ? (
            <>
              <RequestCostSummary jobs={detail.jobProgress} />
              <JobProgressTree jobs={detail.jobProgress} highlightJobId={highlightJobId} jobRef={jobRef} showDebug={showDebug} showDetails={showDetails} />
            </>
          ) : (
            <div className="text-[10px] text-[#9CA3AF] py-2">
              No job progress data available
            </div>
          )}
          {detail?.errorMessage && (
            <div className="mt-2 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2">
              <pre className="text-[10px] text-[#EF4444]/80 font-mono whitespace-pre-wrap break-all">
                {detail.errorMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
