import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, RotateCw, ChevronDown, Share, ExternalLink, ListMusic } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { useAudio } from "../contexts/audio-context";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { useApiFetch } from "../lib/api-client";
import { usePlan } from "../contexts/plan-context";
import { formatDuration } from "../lib/feed-utils";
import { ThumbButtons } from "./thumb-buttons";
import { BlippFeedbackSheet } from "./blipp-feedback-sheet";
import { QueueSheet } from "./queue-sheet";

const RATE_CYCLE = [1, 1.25, 1.5, 2, 0.75] as const;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    currentItem,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    pause,
    resume,
    seek,
    setRate,
    queue,
  } = useAudio();
  const apiFetch = useApiFetch();

  const { open: openPodcast } = usePodcastSheet();
  const { publicSharing } = usePlan();

  // Episode vote state — reset when track changes
  const [episodeVote, setEpisodeVote] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const lastEpisodeId = useRef<string | null>(null);

  useEffect(() => {
    const epId = currentItem?.episode.id;
    if (!epId || epId === lastEpisodeId.current) return;
    lastEpisodeId.current = epId;
    setEpisodeVote(0);
    // Fetch existing vote
    apiFetch<{ vote: number }>(`/podcasts/episodes/vote/${epId}`)
      .catch(() => ({ vote: 0 }))
      .then((data) => {
        if (lastEpisodeId.current === epId) setEpisodeVote(data.vote);
      });
  }, [currentItem?.episode.id, apiFetch]);

  const handleEpisodeVote = useCallback(async (vote: number) => {
    const epId = currentItem?.episode.id;
    if (!epId) return;
    const prev = episodeVote;
    setEpisodeVote(vote);
    try {
      await apiFetch(`/podcasts/episodes/vote/${epId}`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
    } catch {
      setEpisodeVote(prev);
    }
  }, [currentItem?.episode.id, episodeVote, apiFetch]);

  const cycleRate = useCallback(() => {
    const idx = RATE_CYCLE.indexOf(playbackRate as (typeof RATE_CYCLE)[number]);
    const next = RATE_CYCLE[(idx + 1) % RATE_CYCLE.length];
    setRate(next);
  }, [playbackRate, setRate]);

  const handleShare = useCallback(async () => {
    const text = `Check out this briefing from ${currentItem?.podcast.title} on Blipp`;
    const url = `${window.location.origin}/play/${currentItem?.briefing?.id ?? currentItem?.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: currentItem?.episode.title, text, url });
      } catch {
        // User cancelled or share failed silently
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast("Link copied to clipboard");
      } catch {
        // Clipboard failed silently
      }
    }
  }, [currentItem]);

  // Swipe-to-dismiss
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipeStartY = useRef(0);
  const swipeCurrentY = useRef(0);

  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
    swipeCurrentY.current = e.touches[0].clientY;
  }, []);

  const onSwipeMove = useCallback((e: React.TouchEvent) => {
    swipeCurrentY.current = e.touches[0].clientY;
    const dy = swipeCurrentY.current - swipeStartY.current;
    // Only allow downward drag when at scroll top
    const el = sheetRef.current;
    const scrollTop = el?.scrollTop ?? 0;
    if (dy > 0 && scrollTop <= 0 && el) {
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = "none";
    }
  }, []);

  const onSwipeEnd = useCallback(() => {
    const dy = swipeCurrentY.current - swipeStartY.current;
    const el = sheetRef.current;
    const scrollTop = el?.scrollTop ?? 0;
    if (el) {
      el.style.transition = "transform 0.2s ease-out";
      el.style.transform = "";
    }
    if (dy > 100 && scrollTop <= 0) {
      onOpenChange(false);
    }
  }, [onOpenChange]);

  if (!currentItem) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        showCloseButton={false}
        className="h-[85dvh] rounded-t-2xl bg-background border-border flex flex-col items-center px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto"
        overlayClassName="pointer-events-none"
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
      >
        {/* Drag handle + close button */}
        <div className="w-full flex items-center justify-center relative flex-shrink-0 mb-2">
          <div className="w-10 h-1 rounded-full bg-muted" />
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-0 p-1.5 text-muted-foreground hover:text-foreground/80 active:scale-90 transition-all"
            aria-label="Close player"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Accessibility — visually hidden */}
        <SheetTitle className="sr-only">
          {currentItem.episode.title}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Audio player for {currentItem.podcast.title}
        </SheetDescription>

        {/* Artwork + Actions row */}
        <div className="flex items-center w-full max-w-sm mt-1 gap-3">
          {/* Artwork */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => { onOpenChange(false); openPodcast(currentItem.podcast.id); }}
              aria-label="View podcast"
            >
              {currentItem.podcast.imageUrl ? (
                <img
                  src={currentItem.podcast.imageUrl}
                  alt=""
                  className="w-full max-w-[120px] aspect-square rounded-2xl object-contain shadow-lg"
                />
              ) : (
                <div className="w-full max-w-[120px] aspect-square rounded-2xl bg-muted" />
              )}
            </button>
          </div>
          {/* Right actions — listen to original, thumbs, share */}
          <div className="flex items-center gap-1">
            {currentItem?.podcast.podcastIndexId ? (
              <a
                href={`https://podcastindex.org/podcast/${currentItem.podcast.podcastIndexId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Listen to original episode"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null}
            <ThumbButtons vote={episodeVote} onVote={handleEpisodeVote} onThumbsDown={() => setFeedbackOpen(true)} size="md" />
            {publicSharing && (
              <button
                onClick={handleShare}
                className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Share briefing"
              >
                <Share className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="w-full max-w-sm mt-2 text-center">
          <h2 className="text-base font-bold truncate">
            {currentItem.episode.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {currentItem.podcast.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDuration(currentItem.briefing?.clip?.actualSeconds ?? null, currentItem.durationTier)} briefing
          </p>
          {currentItem.briefing?.clip?.previewText && (
            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 text-left">
              {currentItem.briefing.clip.previewText}
            </p>
          )}
        </div>

        {/* Seek bar */}
        <SeekBar
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
        />

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 mt-3 w-full max-w-sm">
          {/* Playback rate */}
          <button
            onClick={cycleRate}
            className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full min-w-[3rem] active:scale-[0.95] transition-transform duration-75"
          >
            {playbackRate}x
          </button>

          {/* Skip back 15s */}
          <button
            onClick={() => seek(Math.max(0, currentTime - 15))}
            className="relative p-2 text-foreground/80 active:scale-[0.90] transition-transform duration-75"
            aria-label="Skip back 15 seconds"
          >
            <RotateCcw className="w-6 h-6" />
            <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%]">
              15
            </span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={isPlaying ? pause : resume}
            className="w-14 h-14 flex items-center justify-center bg-primary text-primary-foreground rounded-full active:scale-[0.95] transition-transform duration-75"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          {/* Skip forward 15s */}
          <button
            onClick={() => seek(Math.min(duration, currentTime + 15))}
            className="relative p-2 text-foreground/80 active:scale-[0.90] transition-transform duration-75"
            aria-label="Skip forward 15 seconds"
          >
            <RotateCw className="w-6 h-6" />
            <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%]">
              15
            </span>
          </button>

          {/* Queue button */}
          <button
            onClick={() => setQueueOpen(true)}
            className="relative text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full min-w-[3rem] flex items-center justify-center gap-1 active:scale-[0.95] transition-transform duration-75"
            aria-label="Open queue"
          >
            <ListMusic className="w-3.5 h-3.5" />
            {queue.length > 0 && (
              <span className="text-primary font-bold">{queue.length}</span>
            )}
          </button>
        </div>
      </SheetContent>
      {currentItem && (
        <BlippFeedbackSheet
          episodeId={currentItem.episode.id}
          briefingId={currentItem.briefing?.id ?? null}
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
        />
      )}
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  SeekBar — custom styled scrubber with drag support                */
/* ------------------------------------------------------------------ */

function SeekBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !duration) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(pct * duration);
    },
    [duration, onSeek]
  );

  // Global mouse/touch handlers for drag seeking
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX);
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [isDragging, handleSeek]);

  return (
    <div className="w-full max-w-sm mt-3">
      <div
        ref={trackRef}
        className="relative w-full h-6 flex items-center cursor-pointer group"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 30 : 5;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onSeek(Math.min(duration, currentTime + step));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onSeek(Math.max(0, currentTime - step));
          } else if (e.key === "Home") {
            e.preventDefault();
            onSeek(0);
          } else if (e.key === "End") {
            e.preventDefault();
            onSeek(duration);
          }
        }}
        onMouseDown={(e) => {
          setIsDragging(true);
          handleSeek(e.clientX);
        }}
        onTouchStart={(e) => {
          setIsDragging(true);
          handleSeek(e.touches[0].clientX);
        }}
      >
        {/* Track background */}
        <div className="absolute w-full h-0.5 bg-muted rounded-full" />
        {/* Played progress */}
        <div
          className="absolute h-0.5 bg-foreground rounded-full"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb — visible on hover or drag */}
        <div
          className={`absolute w-3 h-3 bg-foreground rounded-full -translate-x-1/2 transition-opacity ${
            isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
