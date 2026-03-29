import { useCallback } from "react";
import { Share2, Info, Trash2, ListPlus } from "lucide-react";
import { toast } from "sonner";
import type { FeedItem } from "../types/feed";
import { formatDuration } from "../lib/feed-utils";
import { useAudio } from "../contexts/audio-context";
import { usePlan } from "../contexts/plan-context";
import { ThumbButtons } from "./thumb-buttons";

/** Map raw pipeline error to a short user-facing message. */
function friendlyError(raw: string | null): string {
  if (!raw) return "Something went wrong";
  const l = raw.toLowerCase();
  if (l.includes("audio fetch failed") || l.includes("audio url") || l.includes("non-audio content") || l.includes("too small"))
    return "Episode audio unavailable";
  if (l.includes("no transcript") || l.includes("transcription")
    || l.includes("no narrative") || l.includes("narrative")
    || l.includes("no completed") || l.includes("no clips"))
    return "Blipp creation failed";
  if (l.includes("episode not found"))
    return "Episode no longer available";
  return "Something went wrong";
}

function statusLabel(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating (~2-5 min)";
    case "FAILED":
      return "Error";
    default:
      return null;
  }
}

function statusColor(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "bg-yellow-500/20 text-yellow-400";
    case "FAILED":
      return "bg-red-500/20 text-red-400";
    default:
      return "";
  }
}

function formatEpDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m episode`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m episode` : `${h}h episode`;
}

export function FeedItemCard({
  item,
  onPlay,
  onEpisodeVote,
  onRemove,
  onAddToQueue,
}: {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onEpisodeVote?: (episodeId: string, vote: number) => void;
  onRemove?: () => void;
  onAddToQueue?: () => void;
}) {
  const audio = useAudio();
  const { publicSharing } = usePlan();
  const isPlayable = item.status === "READY" && item.briefing?.clip;
  const isCreating = item.status === "PENDING" || item.status === "PROCESSING";
  const label = statusLabel(item.status);
  const epDuration = formatEpDuration(item.episode.durationSeconds);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `Check out this briefing from ${item.podcast.title} on Blipp`;
    const url = `${window.location.origin}/play/${item.briefing?.id ?? item.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: item.episode.title, text, url }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Link copied to clipboard"); } catch { /* failed */ }
    }
  }, [item.id, item.briefing?.id, item.podcast.title, item.episode.title]);

  const cardInner = (
    <div
      className={`relative flex gap-3 bg-card border border-border rounded-lg p-3 overflow-hidden${
        !item.listened && item.status === "READY"
          ? " border-l-[3px] border-l-primary"
          : ""
      }`}
    >
      {/* Podcast artwork — square, matching card height */}
      {item.podcast.imageUrl ? (
        <img
          src={item.podcast.imageUrl}
          alt=""
          className="self-stretch aspect-square rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="self-stretch aspect-square rounded bg-muted flex-shrink-0" />
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">{item.podcast.title}</p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isPlayable && publicSharing && (
              <button
                aria-label="Share"
                onClick={handleShare}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onEpisodeVote && (
              <ThumbButtons
                vote={item.episodeVote}
                onVote={(v) => onEpisodeVote(item.episode.id, v)}
              />
            )}
            {label && (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor(item.status)}`}
              >
                {label}
              </span>
            )}
          </div>
        </div>
        <p className="font-medium text-sm truncate mt-0.5">
          {item.episode.title}
        </p>
        {item.status === "FAILED" ? (
          <p className="text-[10px] text-red-400/80 mt-1 truncate">
            {friendlyError(item.errorMessage)}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDuration(item.briefing?.clip?.actualSeconds, item.durationTier)}
              {epDuration && (
                <>
                  <span className="text-muted-foreground/60 mx-1">·</span>
                  <span className="text-muted-foreground/60">from {epDuration}</span>
                </>
              )}
            </p>
            {item.briefing?.clip?.previewText && item.status === "READY" && (
              <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                {item.briefing.clip.previewText}
              </p>
            )}
            {item.briefing?.clip?.voiceDegraded && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-1" title="This briefing used an alternate voice due to a temporary service issue">
                <Info className="w-3 h-3" />
                Alternate voice
              </span>
            )}
          </>
        )}
        {/* Desktop-only action buttons */}
        {(onAddToQueue || onRemove) && (
          <div className="hidden sm:flex items-center gap-1 mt-1.5 justify-end">
            {onAddToQueue && item.status === "READY" && item.briefing?.clip && (
              <button
                aria-label="Add to queue"
                onClick={(e) => { e.stopPropagation(); onAddToQueue(); }}
                className="p-1 text-muted-foreground hover:text-blue-400 transition-colors"
              >
                <ListPlus className="w-3.5 h-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                aria-label="Remove from feed"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Wrap creating items with the behind-card sweep glow
  const card = isCreating ? (
    <div className="relative py-[3px]">
      {/* Glow layer — slightly taller than the card, sits behind it */}
      <div className="absolute inset-x-0 inset-y-0 rounded-lg overflow-hidden">
        <div
          className="absolute inset-0 w-1/3"
          style={{
            background: "linear-gradient(90deg, transparent, var(--color-primary), transparent)",
            opacity: 0.45,
            animation: "creating-sweep 2.5s ease-in-out infinite",
          }}
        />
      </div>
      {/* Card sits on top */}
      <div className="relative">{cardInner}</div>
    </div>
  ) : cardInner;

  if (isPlayable) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="w-full text-left active:scale-[0.98] transition-transform duration-75 cursor-pointer"
        onClick={(e) => {
          // Don't play if user clicked a thumb button
          if ((e.target as HTMLElement).closest("[aria-label]")) return;
          audio.play(item);
          onPlay?.(item.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            audio.play(item);
            onPlay?.(item.id);
          }
        }}
      >
        {card}
      </div>
    );
  }

  return card;
}
