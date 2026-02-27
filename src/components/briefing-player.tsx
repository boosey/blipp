import { useRef, useState } from "react";

/** A single segment within a briefing. */
export interface BriefingSegment {
  podcastTitle: string;
  transitionText: string;
}

/** Props for the BriefingPlayer component. */
export interface BriefingPlayerProps {
  audioUrl: string;
  title: string;
  segments: BriefingSegment[];
}

/** Audio player with play/pause, progress bar, and segment list for a briefing. */
export function BriefingPlayer({
  audioUrl,
  title,
  segments,
}: BriefingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  /** Toggles audio playback between play and pause. */
  function handleToggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  /** Updates progress bar as audio plays. */
  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        data-testid="audio-element"
      />
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleToggle}
          className="w-10 h-10 flex items-center justify-center bg-zinc-50 text-zinc-950 rounded-full font-bold"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "||" : "\u25B6"}
        </button>
        <div
          className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden"
          data-testid="progress-bar"
        >
          <div
            className="h-full bg-zinc-50 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-400">Segments</h3>
        {segments.map((seg, i) => (
          <div key={i} className="text-sm border-l-2 border-zinc-700 pl-3">
            <span className="font-medium">{seg.podcastTitle}</span>
            <p className="text-zinc-400">{seg.transitionText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
