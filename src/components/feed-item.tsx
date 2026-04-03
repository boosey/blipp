import { useCallback, useRef, useLayoutEffect, useState } from "react";
import { Share2, Trash2, ListPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { FeedItem } from "../types/feed";
import { formatDuration } from "../lib/feed-utils";
import { useAudio } from "../contexts/audio-context";
import { usePlan } from "../contexts/plan-context";
import { ThumbButtons } from "./thumb-buttons";
import { BlippFeedbackSheet } from "./blipp-feedback-sheet";

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
    case "CANCELLED":
      return "Cancelled";
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
    case "CANCELLED":
      return "bg-gray-500/20 text-gray-400";
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
  onCancel,
}: {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onEpisodeVote?: (episodeId: string, vote: number) => void;
  onRemove?: () => void;
  onAddToQueue?: () => void;
  onCancel?: () => void;
}) {
  const audio = useAudio();
  const { publicSharing } = usePlan();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isPlayable = item.status === "READY" && item.briefing?.clip;
  const isCreating = item.status === "PENDING" || item.status === "PROCESSING";
  const label = statusLabel(item.status);
  const epDuration = formatEpDuration(item.episode.durationSeconds);

  // Measure card height to size artwork as a matching square.
  // Artwork is absolutely positioned so it doesn't influence card height.
  const cardRef = useRef<HTMLDivElement>(null);
  const [artSize, setArtSize] = useState(0);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setArtSize(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      ref={cardRef}
      className={`relative bg-card border border-border rounded-lg overflow-hidden${
        !item.listened && item.status === "READY"
          ? " border-l-[3px] border-l-primary"
          : ""
      }`}
    >
      {/* Podcast artwork — absolutely positioned square, full card height */}
      <div
        className="absolute top-0 left-0 bottom-0 overflow-hidden rounded-l-lg"
        style={{ width: artSize }}
      >
        {item.podcast.imageUrl ? (
          <img
            src={item.podcast.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted" />
        )}
      </div>

      {/* Text — these three lines drive card height; left margin clears artwork + gap */}
      <div className="p-3" style={{ marginLeft: artSize ? artSize + 12 : 0 }}>
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
                onThumbsDown={() => setFeedbackOpen(true)}
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
        <div className="flex items-center justify-between mt-1">
          {item.status === "FAILED" ? (
            <p className="text-[10px] text-red-400/80 truncate">
              {friendlyError(item.errorMessage)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground truncate">
              {formatDuration(item.briefing?.clip?.actualSeconds, item.durationTier)}
              {epDuration && (
                <>
                  <span className="text-muted-foreground/60 mx-1">·</span>
                  <span className="text-muted-foreground/60">from {epDuration}</span>
                </>
              )}
              {item.briefing?.clip?.voiceDegraded && (
                <>
                  <span className="text-muted-foreground/60 mx-1">·</span>
                  <span className="text-amber-400/80 text-[10px]">alt voice</span>
                </>
              )}
            </p>
          )}
          {(onAddToQueue || onRemove || onCancel) && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {onCancel && isCreating && (
                <button
                  aria-label="Cancel briefing"
                  onClick={(e) => { e.stopPropagation(); onCancel(); }}
                  className="p-1 text-muted-foreground hover:text-orange-400 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
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

  const feedbackSheet = (
    <BlippFeedbackSheet
      episodeId={item.episode.id}
      briefingId={item.briefing?.id ?? null}
      open={feedbackOpen}
      onOpenChange={setFeedbackOpen}
    />
  );

  if (isPlayable) {
    return (
      <>
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
        {feedbackSheet}
      </>
    );
  }

  return (
    <>
      {card}
      {feedbackSheet}
    </>
  );
}
