import { Rss, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { AdminPodcast, PodcastStatus } from "@/types/admin";
import { HealthBadge, StatusBadge, SourceBadge } from "./catalog-badges";
import { relativeTime } from "./catalog-utils";

export interface PodcastRowProps {
  podcast: AdminPodcast;
  selected: boolean;
  onClick: () => void;
  onToggleStatus: (id: string, currentStatus: PodcastStatus) => void;
  togglingId: string | null;
  isChecked: boolean;
  onCheckToggle: (id: string) => void;
}

export function PodcastRow({
  podcast,
  selected,
  onClick,
  onToggleStatus,
  togglingId,
  isChecked,
  onCheckToggle,
}: PodcastRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center h-12 px-3 gap-3 transition-colors border-b border-white/5 text-xs",
        selected ? "bg-[#3B82F6]/5" : "hover:bg-white/[0.03] even:bg-[#1A2942]"
      )}
    >
      <span
        className="shrink-0"
        onClick={(e) => { e.stopPropagation(); onCheckToggle(podcast.id); }}
      >
        <span className={cn(
          "h-3.5 w-3.5 rounded border flex items-center justify-center",
          isChecked ? "border-[#3B82F6] bg-[#3B82F6]" : "border-white/20"
        )}>
          {isChecked && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
        </span>
      </span>
      {podcast.imageUrl ? (
        <img src={podcast.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
      ) : (
        <div className="h-7 w-7 rounded bg-white/5 flex items-center justify-center shrink-0">
          <Rss className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
        </div>
      )}
      <span className="flex-1 min-w-0 truncate font-medium">{podcast.title}</span>
      <span className="w-24 text-[#9CA3AF] truncate hidden lg:block">{podcast.author ?? "-"}</span>
      {podcast.language && podcast.language !== "en" && (
        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded shrink-0">
          {podcast.language}
        </span>
      )}
      <span className="w-14 text-right font-mono tabular-nums text-[#9CA3AF]">{podcast.episodeCount}</span>
      <span className="w-12 text-right font-mono tabular-nums text-[#9CA3AF]">{podcast.subscriberCount}</span>
      <span className="w-14 text-center"><SourceBadge source={podcast.source} /></span>
      <span className="w-20 text-center"><HealthBadge health={podcast.feedHealth} /></span>
      <span className="w-16 text-center"><StatusBadge status={podcast.status} /></span>
      <span className="w-16 text-right text-[10px] text-[#9CA3AF]">{relativeTime(podcast.lastFetchedAt)}</span>
      <span className="w-10 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={podcast.status === "active"}
          disabled={podcast.status === "archived" || togglingId === podcast.id}
          onCheckedChange={() => onToggleStatus(podcast.id, podcast.status)}
          aria-label={podcast.status === "active" ? "Pause podcast" : "Activate podcast"}
          className="scale-75 data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
        />
      </span>
    </button>
  );
}
