import { Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/admin-formatters";
import type { ActivityEvent } from "@/types/admin";
import { STAGE_COLOR_MAP } from "./utils";

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLOR_MAP[stage] ?? "#9CA3AF";
  return (
    <span
      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {Object.keys(STAGE_COLOR_MAP).indexOf(stage) + 1 || "?"}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "completed" ? "#10B981" : status === "failed" ? "#EF4444" : status === "in_progress" ? "#F59E0B" : "#9CA3AF";
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "in_progress" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

export { StatusDot };

export interface PipelinePulseWidgetProps {
  events: ActivityEvent[];
  loading: boolean;
  onNavToJob: (requestId?: string, jobId?: string) => void;
}

export function PipelinePulseWidget({ events, loading, onNavToJob }: PipelinePulseWidgetProps) {
  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between p-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold">Pipeline Pulse</span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-[#10B981] font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
          </span>
          LIVE
        </span>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-4 pb-3">
        <div className="space-y-0.5">
          {events.map((evt) => (
            <div
              key={evt.id}
              className={cn(
                "flex items-center gap-2.5 py-1.5 px-2 rounded text-xs transition-colors hover:bg-white/[0.03]",
                evt.status === "failed" && "border-l-2 border-[#EF4444] bg-[#EF4444]/[0.04]",
                (evt.jobId && evt.requestId) && "cursor-pointer"
              )}
              onDoubleClick={() => onNavToJob(evt.requestId, evt.jobId)}
            >
              <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-12 shrink-0">
                {relativeTime(evt.timestamp)}
              </span>
              <StageBadge stage={evt.stage} />
              <div className="flex-1 min-w-0 truncate">
                <span className="text-[#F9FAFB]">{evt.episodeTitle ?? evt.type}</span>
                {evt.podcastName && <span className="text-[#9CA3AF] ml-1">- {evt.podcastName}</span>}
              </div>
              <StatusDot status={evt.status} />
              {evt.processingTime != null && (
                <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-10 text-right">
                  {evt.processingTime < 1000 ? `${evt.processingTime}ms` : `${(evt.processingTime / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          ))}
          {events.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <Clock className="h-6 w-6 mb-2 opacity-40" />
              <span className="text-xs">No recent activity</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
