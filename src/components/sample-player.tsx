import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { SignupChip } from "./browse/signup-chip";

interface SamplePlayerProps {
  audioUrl: string;
  showTitle: string;
  episodeTitle: string;
  /** Where to send the user when the sample ends (signup → this path). */
  signupRedirectTo: string;
  /** Total sample length in seconds. Defaults to 30. */
  sampleSeconds?: number;
  /** Fade-out length in seconds at end of sample. Defaults to 2. */
  fadeOutSeconds?: number;
  /** Compact layout for inline placement (e.g. landing rail). */
  compact?: boolean;
}

type Phase = "idle" | "loading" | "playing" | "paused" | "ended";

/**
 * Click-to-play sample player for unauthenticated visitors.
 *
 * Per Phase 2.3 finalization (iOS Safari gesture rules):
 *   - Always click-to-play. There is NO autoplay prop.
 *   - On the landing page, the parent renders this inside a docked mini-player
 *     opened on the same gesture, so the AudioContext is unlocked in-frame.
 *   - On /p/* and /browse/show/* the visitor taps "Play sample" themselves.
 *
 * Implementation notes:
 *   - Web Audio API `gain` node handles the fade-out; the underlying <audio>
 *     element only triggers playback. Connecting <audio> via
 *     MediaElementAudioSourceNode requires the AudioContext to be created in
 *     a user-gesture handler — done in `start()`, not in `useEffect`.
 *   - When the sample ends, we hand off to a SignupChip so the visitor sees
 *     the value-prop and a converting CTA in the same paint frame.
 */
export function SamplePlayer({
  audioUrl,
  showTitle,
  episodeTitle,
  signupRedirectTo,
  sampleSeconds = 30,
  fadeOutSeconds = 2,
  compact = false,
}: SamplePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceConnectedRef = useRef(false);
  const stopTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0); // 0..1

  const cleanup = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    if (phase === "playing" || phase === "loading") return;

    setPhase("loading");

    // Create audio element on first play. Reusing across runs would require
    // resetting state which Web Audio sources do not support cleanly.
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audioRef.current = audio;
    }
    audio.src = audioUrl;

    // AudioContext must be created within the user gesture for iOS Safari.
    // Reuse the same context across replays.
    if (!audioCtxRef.current) {
      const Ctor =
        (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) {
        // No Web Audio support: fall back to plain timed pause without fade.
        audio.play().catch(() => setPhase("idle"));
        setPhase("playing");
        scheduleStop(audio, null, sampleSeconds, fadeOutSeconds);
        return;
      }
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current as AudioContext;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Some browsers reject when not in a gesture; ignore — playback may still work.
      }
    }

    // Wire <audio> → GainNode → destination. Source nodes can only be
    // created once per <audio>, so we guard with sourceConnectedRef.
    let gain = gainRef.current;
    if (!sourceConnectedRef.current) {
      const source = ctx.createMediaElementSource(audio);
      gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(ctx.destination);
      gainRef.current = gain;
      sourceConnectedRef.current = true;
    }

    try {
      await audio.play();
      setPhase("playing");
      scheduleStop(audio, gain, sampleSeconds, fadeOutSeconds);
    } catch (err) {
      console.warn("sample player: playback rejected", err);
      setPhase("idle");
    }
  }, [audioUrl, phase, sampleSeconds, fadeOutSeconds]);

  function scheduleStop(
    audio: HTMLAudioElement,
    gain: GainNode | null,
    total: number,
    fade: number
  ) {
    const onTime = () => {
      if (!audio.duration) return;
      setProgress(Math.min(1, audio.currentTime / total));
    };
    audio.addEventListener("timeupdate", onTime);

    const fadeStartMs = Math.max(0, (total - fade) * 1000);
    const stopMs = total * 1000;

    if (gain && audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      // Schedule a linear ramp from 1 → 0 over the last `fade` seconds.
      // setValueAtTime captures the current value so the ramp starts cleanly.
      gain.gain.setValueAtTime(1, ctx.currentTime + fadeStartMs / 1000);
      gain.gain.linearRampToValueAtTime(
        0.0001,
        ctx.currentTime + stopMs / 1000
      );
    }

    stopTimerRef.current = window.setTimeout(() => {
      audio.removeEventListener("timeupdate", onTime);
      audio.pause();
      setProgress(1);
      setPhase("ended");
    }, stopMs);
  }

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setPhase("paused");
  }, []);

  const isBusy = phase === "loading";
  const isPlaying = phase === "playing";
  const isEnded = phase === "ended";

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-lg ${
        compact ? "p-3" : "p-4"
      } text-white`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={isPlaying ? pause : start}
          disabled={isBusy}
          aria-label={isPlaying ? "Pause sample" : "Play sample"}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isBusy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/50 truncate">{showTitle}</p>
          <p className="text-sm font-medium truncate">{episodeTitle}</p>
          <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-[width]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-white/40 mt-1">
            {sampleSeconds}-second sample
          </p>
        </div>
      </div>

      {isEnded && (
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <p className="text-sm text-white/80 flex-1">
            That's the sample. Sign up to hear the full Blipp.
          </p>
          <SignupChip
            label="Sign up free"
            size="md"
            redirectTo={signupRedirectTo}
          />
        </div>
      )}
    </div>
  );
}
