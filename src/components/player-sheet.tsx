import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { useAudio } from "../contexts/audio-context";

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
    adState,
    adProgress,
    adDuration,
    adCurrentTime,
  } = useAudio();

  const cycleRate = useCallback(() => {
    const idx = RATE_CYCLE.indexOf(playbackRate as (typeof RATE_CYCLE)[number]);
    const next = RATE_CYCLE[(idx + 1) % RATE_CYCLE.length];
    setRate(next);
  }, [playbackRate, setRate]);

  if (!currentItem) return null;

  const inAd = adState === "preroll" || adState === "postroll";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[95vh] rounded-t-2xl bg-zinc-950 border-zinc-800 flex flex-col items-center px-6 pt-3 pb-8"
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-zinc-700 mb-6 flex-shrink-0" />

        {/* Accessibility — visually hidden */}
        <SheetTitle className="sr-only">
          {inAd ? "Advertisement" : currentItem.episode.title}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {inAd
            ? `${adState === "preroll" ? "Pre-roll" : "Post-roll"} advertisement`
            : `Audio player for ${currentItem.podcast.title}`}
        </SheetDescription>

        {/* Artwork */}
        <div className="flex-1 flex items-center justify-center w-full max-w-sm">
          {inAd ? (
            <div className="w-full max-w-[320px] aspect-square rounded-2xl bg-zinc-900 flex flex-col items-center justify-center gap-3 border border-[#F97316]/20">
              <span className="text-2xl font-bold text-[#F97316]">Advertisement</span>
              <span className="text-sm text-zinc-400">
                {adState === "preroll" ? "Pre-roll" : "Post-roll"}
              </span>
            </div>
          ) : currentItem.podcast.imageUrl ? (
            <img
              src={currentItem.podcast.imageUrl}
              alt=""
              className="w-full max-w-[320px] aspect-square rounded-2xl object-cover shadow-lg"
            />
          ) : (
            <div className="w-full max-w-[320px] aspect-square rounded-2xl bg-zinc-800" />
          )}
        </div>

        {/* Info */}
        <div className="w-full max-w-sm mt-6 text-center">
          {inAd ? (
            <>
              <h2 className="text-lg font-bold text-[#F97316]">Advertisement</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {adState === "preroll" ? "Pre-roll" : "Post-roll"} — {formatTime(adCurrentTime)} / {formatTime(adDuration)}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold truncate">
                {currentItem.episode.title}
              </h2>
              <p className="text-sm text-zinc-400 mt-1 truncate">
                {currentItem.podcast.title}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {currentItem.durationTier}m briefing
              </p>
            </>
          )}
        </div>

        {/* Seek bar or ad progress */}
        {inAd ? (
          <AdProgressBar progress={adProgress} />
        ) : (
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
          />
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-8 mt-6 w-full max-w-sm">
          {inAd ? (
            /* Ad controls: only play/pause, no skip, no rate */
            <>
              <div className="min-w-[3rem]" />
              <div className="w-6 h-6" />
              <button
                onClick={isPlaying ? pause : resume}
                className="w-16 h-16 flex items-center justify-center bg-[#F97316] text-white rounded-full"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7" />
                ) : (
                  <Play className="w-7 h-7 ml-0.5" />
                )}
              </button>
              <div className="w-6 h-6" />
              <div className="min-w-[3rem]" />
            </>
          ) : (
            /* Content controls: full set */
            <>
              {/* Playback rate */}
              <button
                onClick={cycleRate}
                className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full min-w-[3rem]"
              >
                {playbackRate}x
              </button>

              {/* Skip back 15s */}
              <button
                onClick={() => seek(Math.max(0, currentTime - 15))}
                className="relative p-2 text-zinc-300"
                aria-label="Skip back 15 seconds"
              >
                <SkipBack className="w-6 h-6" />
                <span className="absolute text-[10px] font-medium top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  15
                </span>
              </button>

              {/* Play/Pause */}
              <button
                onClick={isPlaying ? pause : resume}
                className="w-16 h-16 flex items-center justify-center bg-white text-zinc-950 rounded-full"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7" />
                ) : (
                  <Play className="w-7 h-7 ml-0.5" />
                )}
              </button>

              {/* Skip forward 30s */}
              <button
                onClick={() => seek(Math.min(duration, currentTime + 30))}
                className="relative p-2 text-zinc-300"
                aria-label="Skip forward 30 seconds"
              >
                <SkipForward className="w-6 h-6" />
                <span className="absolute text-[10px] font-medium top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  30
                </span>
              </button>

              {/* Spacer to balance rate button */}
              <div className="min-w-[3rem]" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  AdProgressBar — non-interactive progress indicator for ads         */
/* ------------------------------------------------------------------ */

function AdProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-sm mt-6">
      <div className="relative w-full h-6 flex items-center">
        {/* Track background */}
        <div className="absolute w-full h-0.5 bg-zinc-700 rounded-full" />
        {/* Progress */}
        <div
          className="absolute h-0.5 bg-[#F97316] rounded-full transition-all duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
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
    <div className="w-full max-w-sm mt-6">
      <div
        ref={trackRef}
        className="relative w-full h-6 flex items-center cursor-pointer group"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
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
        <div className="absolute w-full h-0.5 bg-zinc-700 rounded-full" />
        {/* Played progress */}
        <div
          className="absolute h-0.5 bg-white rounded-full"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb — visible on hover or drag */}
        <div
          className={`absolute w-3 h-3 bg-white rounded-full -translate-x-1/2 transition-opacity ${
            isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
