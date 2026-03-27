import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AdminClipSummary } from "@/types/admin";
import { relativeTime } from "./catalog-utils";

export function ClipRow({ clip }: { clip: AdminClipSummary }) {
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const tierLabel = `${clip.durationTier} min`;
  const clipStatusColor =
    clip.status === "COMPLETED" ? "#10B981" :
    clip.status === "FAILED" ? "#EF4444" : "#F59E0B";

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-white/[0.03] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-12">{tierLabel}</span>
        {clip.actualSeconds != null && (
          <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-10">{clip.actualSeconds}s</span>
        )}
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
          style={{ backgroundColor: `${clipStatusColor}15`, color: clipStatusColor }}
        >
          {clip.status}
        </span>
        <span className="flex-1" />
        {clip.audioUrl && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-[#9CA3AF] hover:text-[#3B82F6]"
            onClick={(e) => { e.stopPropagation(); setPlaying(!playing); }}
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
      </div>
      {playing && clip.audioUrl && (
        <div className="px-2 pb-2">
          <audio controls src={clip.audioUrl} className="w-full h-7" />
        </div>
      )}
      {expanded && clip.feedItems.length > 0 && (
        <div className="px-2 pb-2 space-y-1">
          {clip.feedItems.map((fi) => (
            <div key={fi.id} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-white/[0.02]">
              <span className="text-[#9CA3AF] font-mono truncate w-16" title={fi.userId}>
                {fi.userId.slice(0, 8)}...
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                fi.source === "SUBSCRIPTION" ? "bg-[#3B82F6]/15 text-[#3B82F6]" : "bg-[#A855F7]/15 text-[#A855F7]"
              )}>
                {fi.source === "SUBSCRIPTION" ? "sub" : "demand"}
              </span>
              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                style={{
                  backgroundColor: fi.status === "READY" ? "#10B98115" : "#F59E0B15",
                  color: fi.status === "READY" ? "#10B981" : "#F59E0B",
                }}
              >
                {fi.status}
              </span>
              <span className="text-[#9CA3AF] font-mono truncate w-14" title={fi.requestId ?? undefined}>
                {fi.requestId ? `${fi.requestId.slice(0, 6)}...` : "\u2014"}
              </span>
              <span className="text-[#9CA3AF] ml-auto">{relativeTime(fi.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && clip.feedItems.length === 0 && (
        <div className="px-4 pb-2 text-[10px] text-[#9CA3AF]">No feed items</div>
      )}
    </div>
  );
}
