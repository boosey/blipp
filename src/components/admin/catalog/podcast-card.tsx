import { Rss, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { AdminPodcast, PodcastStatus } from "@/types/admin";
import { HealthBadge, StatusBadge, SourceBadge } from "./catalog-badges";
import { relativeTime } from "./catalog-utils";

export interface PodcastCardProps {
  podcast: AdminPodcast;
  selected: boolean;
  onClick: () => void;
  onToggleStatus: (id: string, currentStatus: PodcastStatus) => void;
  togglingId: string | null;
  isChecked: boolean;
  onCheckToggle: (id: string) => void;
}

export function PodcastCard({
  podcast,
  selected,
  onClick,
  onToggleStatus,
  togglingId,
  isChecked,
  onCheckToggle,
}: PodcastCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg bg-[#1A2942] border p-3 transition-all hover:border-white/10 group",
        selected ? "border-[#3B82F6]/40 bg-[#3B82F6]/5" : "border-white/5"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 shrink-0"
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
          <img src={podcast.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Rss className="h-5 w-5 text-[#9CA3AF]/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="text-xs font-medium truncate">{podcast.title}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {podcast.language && podcast.language !== "en" && (
                <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded">
                  {podcast.language}
                </span>
              )}
              <SourceBadge source={podcast.source} />
              <HealthBadge health={podcast.feedHealth} />
              <Switch
                checked={podcast.status === "active"}
                disabled={podcast.status === "archived" || togglingId === podcast.id}
                onCheckedChange={() => onToggleStatus(podcast.id, podcast.status)}
                onClick={(e) => e.stopPropagation()}
                aria-label={podcast.status === "active" ? "Pause podcast" : "Activate podcast"}
                className="scale-75"
                style={{ backgroundColor: podcast.status === "active" ? "#10B981" : "#4B5563" }}
              />
            </div>
          </div>
          {podcast.author && (
            <span className="text-[10px] text-[#9CA3AF] block truncate mt-0.5">{podcast.author}</span>
          )}
          <div className="flex gap-1 mt-1">
            {podcast.categories?.slice(0, 3).map((cat) => (
              <span key={cat} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-500 text-[10px] rounded-full">
                {cat}
              </span>
            ))}
            {(podcast.categories?.length ?? 0) > 3 && (
              <span className="text-[10px] text-zinc-600">+{podcast.categories!.length - 3}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#9CA3AF]">
            <span className="font-mono tabular-nums">{podcast.episodeCount} eps</span>
            <span className="font-mono tabular-nums">{podcast.subscriberCount} subs</span>
            <span>{relativeTime(podcast.lastFetchedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
