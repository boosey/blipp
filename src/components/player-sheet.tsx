import { useCallback, useRef } from "react";
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
  } = useAudio();

  const seekBarRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const bar = seekBarRef.current;
      if (!bar || !duration) return;

      const rect = bar.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      const fraction = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      seek(fraction * duration);
    },
    [duration, seek]
  );

  const cycleRate = useCallback(() => {
    const idx = RATE_CYCLE.indexOf(playbackRate as (typeof RATE_CYCLE)[number]);
    const next = RATE_CYCLE[(idx + 1) % RATE_CYCLE.length];
    setRate(next);
  }, [playbackRate, setRate]);

  if (!currentItem) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          {currentItem.episode.title}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Audio player for {currentItem.podcast.title}
        </SheetDescription>

        {/* Artwork */}
        <div className="flex-1 flex items-center justify-center w-full max-w-sm">
          {currentItem.podcast.imageUrl ? (
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
          <h2 className="text-lg font-bold truncate">
            {currentItem.episode.title}
          </h2>
          <p className="text-sm text-zinc-400 mt-1 truncate">
            {currentItem.podcast.title}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {currentItem.durationTier}m briefing
          </p>
        </div>

        {/* Seek bar */}
        <div className="w-full max-w-sm mt-6">
          <div
            ref={seekBarRef}
            className="relative w-full h-1.5 bg-zinc-700 rounded-full cursor-pointer"
            onClick={handleSeek}
            onTouchMove={handleSeek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
          >
            <div
              className="absolute top-0 left-0 h-full bg-white rounded-full"
              style={{ width: `${progress}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow"
              style={{ left: `${progress}%`, marginLeft: "-6px" }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500 mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-8 mt-6 w-full max-w-sm">
          {/* Playback rate */}
          <button
            onClick={cycleRate}
            className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded min-w-[3rem]"
          >
            {playbackRate}x
          </button>

          {/* Skip back 15s */}
          <button
            onClick={() => seek(Math.max(0, currentTime - 15))}
            className="p-2 text-zinc-300"
            aria-label="Skip back 15 seconds"
          >
            <SkipBack className="w-6 h-6" />
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
              <Play className="w-7 h-7 ml-1" />
            )}
          </button>

          {/* Skip forward 30s */}
          <button
            onClick={() => seek(Math.min(duration, currentTime + 30))}
            className="p-2 text-zinc-300"
            aria-label="Skip forward 30 seconds"
          >
            <SkipForward className="w-6 h-6" />
          </button>

          {/* Spacer to balance rate button */}
          <div className="min-w-[3rem]" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
