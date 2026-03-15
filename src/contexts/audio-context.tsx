import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FeedItem } from "../types/feed";
import type { AdConfig, AdState } from "../types/ads";
import { useApiFetch } from "../lib/api";
import { useImaAds } from "../hooks/use-ima-ads";

interface AudioState {
  currentItem: FeedItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
  // Ad state
  adState: AdState;
  isAdPlaying: boolean;
  adProgress: number;
  adDuration: number;
  adCurrentTime: number;
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

  // Ad state
  const [adState, setAdState] = useState<AdState>("none");
  const adConfigRef = useRef<AdConfig | null>(null);
  const pendingItemRef = useRef<FeedItem | null>(null);

  // Start content playback (called after preroll or when no ads)
  const startContentPlayback = useCallback(
    (item: FeedItem) => {
      const audio = audioRef.current;
      if (!audio || !item.briefing) return;

      setAdState("content");
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
      }
    },
    [apiFetch, playbackRate]
  );

  // IMA ads hook callbacks
  const onPrerollComplete = useCallback(() => {
    const item = pendingItemRef.current;
    if (item) {
      startContentPlayback(item);
    }
  }, [startContentPlayback]);

  const onPostrollComplete = useCallback(() => {
    setAdState("none");
    setIsPlaying(false);
  }, []);

  // Track which ad flow we're in
  const adFlowRef = useRef<"preroll" | "postroll" | null>(null);

  const handleAdStart = useCallback(() => {
    // Ad has started playing
  }, []);

  const handleAdComplete = useCallback(() => {
    if (adFlowRef.current === "preroll") {
      adFlowRef.current = null;
      onPrerollComplete();
    } else if (adFlowRef.current === "postroll") {
      adFlowRef.current = null;
      onPostrollComplete();
    }
  }, [onPrerollComplete, onPostrollComplete]);

  const handleAdError = useCallback(() => {
    // Errors are handled in useImaAds — it calls onAdComplete after error
  }, []);

  const ima = useImaAds({
    onAdStart: handleAdStart,
    onAdComplete: handleAdComplete,
    onAdError: handleAdError,
  });

  const pause = useCallback(() => {
    if (ima.isAdPlaying) {
      ima.pauseAd();
      setIsPlaying(false);
      return;
    }
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [ima]);

  const resume = useCallback(() => {
    if (ima.isAdPlaying) {
      ima.resumeAd();
      setIsPlaying(true);
      return;
    }
    audioRef.current?.play();
    setIsPlaying(true);
  }, [ima]);

  const seek = useCallback((time: number) => {
    if (adState !== "content" && adState !== "none") return; // No-op during ads
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, [adState]);

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
    ima.destroy();
    setCurrentItem(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setAdState("none");
    adConfigRef.current = null;
    pendingItemRef.current = null;
    adFlowRef.current = null;
  }, [ima]);

  const play = useCallback(
    async (item: FeedItem) => {
      const audio = audioRef.current;
      if (!audio || !item.briefing) return;

      // Store the item for after preroll
      pendingItemRef.current = item;
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setAdState("loading-ad-config");

      // Fetch ad config
      try {
        const params = new URLSearchParams({
          briefingId: item.briefing.id,
          durationTier: String(item.durationTier),
        });
        const config = await apiFetch<AdConfig>(
          `/ads/config?${params.toString()}`
        );
        adConfigRef.current = config;
      } catch {
        // Ad config fetch failed — play content without ads
        adConfigRef.current = null;
      }

      const config = adConfigRef.current;

      // Check if preroll should play
      if (
        config?.adsEnabled &&
        config.preroll.enabled &&
        config.preroll.vastTagUrl
      ) {
        setAdState("preroll");
        setIsLoading(false);
        setIsPlaying(true);
        adFlowRef.current = "preroll";
        ima.requestAds(config.preroll.vastTagUrl);
        return;
      }

      // No preroll — start content directly
      startContentPlayback(item);
    },
    [apiFetch, ima, startContentPlayback]
  );

  // Handle content ended — check for postroll
  const handleEnded = useCallback(() => {
    const config = adConfigRef.current;
    if (
      config?.adsEnabled &&
      config.postroll.enabled &&
      config.postroll.vastTagUrl
    ) {
      setAdState("postroll");
      setIsPlaying(true);
      adFlowRef.current = "postroll";
      ima.requestAds(config.postroll.vastTagUrl);
      return;
    }
    setAdState("none");
    setIsPlaying(false);
  }, [ima]);

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

  // Media Session handlers — disable seek during ads
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const isInAd = adState === "preroll" || adState === "postroll";

    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());

    if (isInAd) {
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    } else {
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        const audio = audioRef.current;
        if (audio) seek(Math.max(0, audio.currentTime - 15));
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        const audio = audioRef.current;
        if (audio) seek(Math.min(audio.duration || 0, audio.currentTime + 30));
      });
    }
  }, [adState, pause, resume, seek]);

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
    // Ad state
    adState,
    isAdPlaying: ima.isAdPlaying,
    adProgress: ima.adProgress,
    adDuration: ima.adDuration,
    adCurrentTime: ima.adCurrentTime,
    // Actions
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
