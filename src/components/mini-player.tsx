import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Play, Pause } from "lucide-react";
import { useAudio } from "../contexts/audio-context";
import { PlayerSheet } from "./player-sheet";

export interface MiniPlayerHandle {
  closeSheet: () => void;
}

export const MiniPlayer = forwardRef<MiniPlayerHandle>(function MiniPlayer(_props, ref) {
  const {
    currentItem,
    isPlaying,
    currentTime,
    duration,
    pause,
    resume,
    isAdPlaying,
    adProgress,
    adState,
  } = useAudio();
  const [sheetOpen, setSheetOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    closeSheet: () => setSheetOpen(false),
  }), []);

  if (!currentItem) return null;

  const inAd = adState === "preroll" || adState === "postroll";
  const progress = inAd
    ? adProgress * 100
    : duration > 0
      ? (currentTime / duration) * 100
      : 0;

  return (
    <>
      <div className={`fixed bottom-[calc(env(safe-area-inset-bottom)+49px)] left-0 right-0 z-[60] max-w-3xl mx-auto${sheetOpen ? " hidden" : ""}`}>
        {/* Progress bar */}
        <div
          className={`absolute top-0 left-0 h-0.5 transition-all duration-200 ${
            inAd ? "bg-[#F97316]" : "bg-foreground"
          }`}
          style={{ width: `${progress}%` }}
        />

        <div className="flex items-center gap-3 px-4 h-14 bg-card border-t border-border">
          {/* Artwork or Ad badge */}
          {inAd ? (
            <div className="w-10 h-10 rounded bg-[#F97316]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-[#F97316] uppercase">Ad</span>
            </div>
          ) : currentItem.podcast.imageUrl ? (
            <img
              src={currentItem.podcast.imageUrl}
              alt=""
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
          )}

          {/* Text — opens PlayerSheet */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-1 min-w-0 text-left"
          >
            {inAd ? (
              <>
                <p className="text-sm font-medium truncate text-[#F97316]">
                  Advertisement
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {adState === "preroll" ? "Pre-roll" : "Post-roll"}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium truncate">
                  {currentItem.episode.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentItem.podcast.title}
                </p>
              </>
            )}
          </button>

          {/* Play/Pause */}
          <button
            onClick={isPlaying ? pause : resume}
            className="flex-shrink-0 p-2"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      <PlayerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
});
