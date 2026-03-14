import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FeedItem } from "../types/feed";
import { useApiFetch } from "../lib/api";

interface AudioState {
  currentItem: FeedItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

interface AudioActions {
  play: (item: FeedItem) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
}

type AudioContextValue = AudioState & AudioActions;

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return ctx;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const apiFetch = useApiFetch();

  const [currentItem, setCurrentItem] = useState<FeedItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play();
    setIsPlaying(true);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setCurrentItem(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  const play = useCallback(
    (item: FeedItem) => {
      const audio = audioRef.current;
      if (!audio || !item.briefing) return;

      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);

      audio.src = `/api/briefings/${item.briefing.id}/audio`;
      audio.playbackRate = playbackRate;
      audio.play().catch(() => {
        setIsLoading(false);
        setError("Failed to play audio");
      });

      // Fire-and-forget listened PATCH
      if (!item.listened) {
        apiFetch(`/feed/${item.id}/listened`, { method: "PATCH" }).catch(
          () => {}
        );
      }

      // Media Session API
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.episode.title,
          artist: item.podcast.title,
          artwork: item.podcast.imageUrl
            ? [
                {
                  src: item.podcast.imageUrl,
                  sizes: "512x512",
                  type: "image/jpeg",
                },
              ]
            : [],
        });
        navigator.mediaSession.setActionHandler("play", () => resume());
        navigator.mediaSession.setActionHandler("pause", () => pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => {
          const audio = audioRef.current;
          if (audio) seek(Math.max(0, audio.currentTime - 15));
        });
        navigator.mediaSession.setActionHandler("seekforward", () => {
          const audio = audioRef.current;
          if (audio) seek(Math.min(audio.duration || 0, audio.currentTime + 30));
        });
      }
    },
    [apiFetch, pause, playbackRate, resume, seek]
  );

  // Audio element event handlers
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsPlaying(false);
    setIsLoading(false);
    setError("Failed to load audio");
  }, []);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Sync mediaSession position state
  useEffect(() => {
    if ("mediaSession" in navigator && duration > 0) {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.min(currentTime, duration),
      });
    }
  }, [currentTime, duration, playbackRate]);

  const value: AudioContextValue = {
    currentItem,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoading,
    error,
    play,
    pause,
    resume,
    seek,
    setRate,
    stop,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onError={handleError}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        preload="metadata"
        style={{ display: "none" }}
      />
    </AudioContext.Provider>
  );
}
