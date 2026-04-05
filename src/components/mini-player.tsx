import { useState, useImperativeHandle, forwardRef } from "react";
import { Play, Pause, ChevronUp, SkipForward } from "lucide-react";
import { useAudio } from "../contexts/audio-context";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { PlayerSheet } from "./player-sheet";

export interface MiniPlayerHandle {
  closeSheet: () => void;
}

function WaveformBars() {
  return (
    <div className="flex items-end gap-[2px] h-[14px] w-[14px] flex-shrink-0">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="waveform-bar w-[3px] rounded-full flex-shrink-0"
          style={{
            animationDelay: `${i * 0.18}s`,
            background: "oklch(0.65 0.15 250)",
          }}
        />
      ))}
    </div>
  );
}

export const MiniPlayer = forwardRef<MiniPlayerHandle>(function MiniPlayer(_props, ref) {
  const {
    currentItem,
    isPlaying,
    currentTime,
    duration,
    pause,
    resume,
    seek,
    adProgress,
    adState,
  } = useAudio();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { open: openPodcast } = usePodcastSheet();

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

  function handleSkip15(e: React.MouseEvent) {
    e.stopPropagation();
    if (!inAd && duration > 0) {
      seek(Math.min(currentTime + 15, duration));
    }
  }

  return (
    <>
      <div
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+49px)] left-0 right-0 z-[60] max-w-3xl mx-auto px-3"
        style={sheetOpen ? { display: "none" } : undefined}
      >
        {/* Floating pill */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSheetOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSheetOpen(true); }}
          aria-label="Open full player"
          className="relative rounded-2xl overflow-hidden cursor-pointer select-none"
          style={{
            background: "oklch(0.13 0.015 250)",
            boxShadow: isPlaying
              ? "0 6px 30px -4px oklch(0.45 0.18 250 / 0.45), 0 2px 10px -2px oklch(0 0 0 / 0.6)"
              : "0 6px 20px -4px oklch(0 0 0 / 0.55), 0 2px 8px -2px oklch(0 0 0 / 0.4)",
          }}
        >
          <div className="flex items-center gap-3 px-3 h-[62px]">
            {/* Artwork */}
            <button
              onClick={(e) => { e.stopPropagation(); openPodcast(currentItem.podcast.id); }}
              className="flex-shrink-0"
              aria-label="View podcast"
            >
              {inAd ? (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "oklch(0.55 0.18 45 / 0.2)", border: "1px solid oklch(0.65 0.18 45 / 0.4)" }}
                >
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: "oklch(0.72 0.18 45)" }}>Ad</span>
                </div>
              ) : currentItem.podcast.imageUrl ? (
                <img
                  src={currentItem.podcast.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover"
                  style={{ boxShadow: "0 0 0 1px oklch(1 0 0 / 0.12)" }}
                />
              ) : (
                <div className="w-10 h-10 rounded-xl" style={{ background: "oklch(0.25 0 0)" }} />
              )}
            </button>

            {/* Text */}
            <div className="flex-1 min-w-0 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-[3px]">
                {isPlaying && !inAd && <WaveformBars />}
                <p
                  className="text-[13px] font-semibold truncate leading-tight"
                  style={{ color: "oklch(0.95 0 0)" }}
                >
                  {inAd ? "Advertisement" : currentItem.episode.title}
                </p>
              </div>
              <p
                className="text-[11px] truncate leading-tight"
                style={{ color: "oklch(0.55 0 0)" }}
              >
                {inAd
                  ? adState === "preroll" ? "Pre-roll · Playing now" : "Post-roll · Playing now"
                  : currentItem.podcast.title}
              </p>
            </div>

            {/* Skip +15 */}
            {!inAd && (
              <button
                onClick={handleSkip15}
                className="flex-shrink-0 flex flex-col items-center justify-center gap-[2px] py-2 px-1.5 rounded-lg transition-opacity active:opacity-60"
                aria-label="Skip 15 seconds forward"
                style={{ color: "oklch(0.5 0 0)" }}
              >
                <SkipForward className="w-4 h-4" style={{ color: "oklch(0.52 0 0)" }} />
                <span
                  className="text-[9px] font-bold leading-none tabular-nums"
                  style={{ color: "oklch(0.45 0 0)" }}
                >
                  +15
                </span>
              </button>
            )}

            {/* Play / Pause — prominent circle */}
            <button
              onClick={(e) => { e.stopPropagation(); isPlaying ? pause() : resume(); }}
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{
                background: inAd
                  ? "oklch(0.65 0.18 45)"
                  : "oklch(0.55 0.16 250)",
                boxShadow: "0 2px 8px -1px oklch(0 0 0 / 0.5)",
              }}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-[15px] h-[15px] text-white" fill="white" stroke="none" />
              ) : (
                <Play className="w-[15px] h-[15px] text-white" fill="white" stroke="none" style={{ marginLeft: "1px" }} />
              )}
            </button>

            {/* Expand chevron — affordance indicator */}
            <ChevronUp
              className="w-4 h-4 flex-shrink-0 -ml-1"
              style={{ color: "oklch(0.38 0 0)" }}
            />
          </div>

          {/* Progress bar — bottom of pill */}
          <div style={{ height: "3px", background: "oklch(0.22 0 0)" }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: inAd
                  ? "oklch(0.65 0.18 45)"
                  : "oklch(0.55 0.16 250)",
              }}
            />
          </div>
        </div>
      </div>

      <PlayerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
});
