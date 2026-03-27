import { CircleDot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/admin-formatters";
import type { ActivityEvent } from "@/types/admin";
import { StatusDot } from "./pipeline-pulse-widget";

export interface RecentActivityWidgetProps {
  events: ActivityEvent[];
}

export function RecentActivityWidget({ events }: RecentActivityWidgetProps) {
  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
        <CircleDot className="h-4 w-4 text-[#14B8A6]" />
        <span className="text-sm font-semibold">Recent Activity</span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2">
          {events.slice(0, 8).map((evt) => (
            <div key={`ra-${evt.id}`} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-12 shrink-0">
                {relativeTime(evt.timestamp)}
              </span>
              <StatusDot status={evt.status} />
              <span className="truncate flex-1 text-[#F9FAFB]/80">
                {evt.type === "FEED_REFRESH" ? "Refreshed feed" :
                 evt.type === "TRANSCRIPTION" ? "Transcribed" :
                 evt.type === "DISTILLATION" ? "Distilled" :
                 evt.type === "NARRATIVE_GENERATION" ? "Generated narrative" :
                 evt.type === "AUDIO_GENERATION" ? "Generated audio" :
                 evt.type === "CLIP_GENERATION" ? "Generated clips" :
                 "Assembled briefing"}
                {evt.episodeTitle && <span className="text-[#9CA3AF]"> - {evt.episodeTitle}</span>}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
