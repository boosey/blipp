import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import type { FeedItem } from "../types/feed";
import type { AdConfig, AdState } from "../types/ads";
import { useApiFetch } from "../lib/api";
import { useImaAds } from "../hooks/use-ima-ads";
import { getJingleUrl } from "../lib/jingle-cache";
import { getApiBase } from "../lib/api-base";

// Minimal silent WAV (22050Hz, 16-bit mono, 2 samples) used to "unlock"
// the HTMLAudioElement on mobile within the user-gesture context.  Mobile
// browsers block audio.play() after any `await`, so we play this silence
// synchronously before fetching ad config.
const UNLOCK_AUDIO =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAAAA";

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
  playAll: (items: FeedItem[]) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
  addToQueue: (item: FeedItem) => void;
  removeFromQueue: (itemId: string) => void;
  clearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  skipToQueueItem: (itemId: string) => void;
}

interface AudioQueueState {
  queue: FeedItem[];
}

type AudioContextValue = AudioState & AudioActions & AudioQueueState;

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
  const { getToken } = useAuth();

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
  // Guards against audio element events fired by the silent unlock WAV
  const unlockingRef = useRef(false);

  // Queue for Play All — ref for internal logic, state for UI reactivity
  const queueRef = useRef<FeedItem[]>([]);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const syncQueue = useCallback(() => setQueue([...queueRef.current]), []);

  // Playback position saving
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Delayed listened marker — fires after 30s of content playback
  const listenedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenedFiredRef = useRef<string | null>(null);

  const isDigestItem = useCallback(
    (item: FeedItem | null) =>
      item?.briefing?.clip?.audioUrl?.startsWith("/api/digest") ?? false,
    []
  );

  const savePlaybackPosition = useCallback(
    (itemId: string, position: number | null) => {
      // Skip progress saves for digest items (short, no resume needed)
      if (currentItem && isDigestItem(currentItem)) return;
      apiFetch(`/feed/${itemId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ positionSeconds: position }),
      }).catch(() => {});
    },
    [apiFetch, isDigestItem, currentItem]
  );

  // Begin content playback — sets src to briefing audio, fires listened PATCH
  const beginContent = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;

      setAdState("content");
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);

      const audio = audioRef.current;
      if (!audio) return;

      // Fetch audio with auth token — <audio> element can't send Authorization headers
      try {
        const token = await getToken();
        // Use clip.audioUrl if it's a path (e.g. digest audio), otherwise default to briefings endpoint
        const audioPath = item.briefing.clip.audioUrl?.startsWith("/api/")
          ? item.briefing.clip.audioUrl
          : `/api/briefings/${item.briefing.id}/audio`;
        const res = await fetch(
          `${getApiBase()}${audioPath}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
        const blob = await res.blob();
        audio.src = URL.createObjectURL(blob);
      } catch {
        setIsLoading(false);
        setError("Failed to load audio");
        return;
      }

      audio.playbackRate = playbackRate;
      audio.play().catch(() => {
        setIsLoading(false);
        setError("Failed to play audio");
      });

      // Reset listened timer — will be marked via effect after 30s of playback
      if (listenedTimerRef.current) {
        clearTimeout(listenedTimerRef.current);
        listenedTimerRef.current = null;
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
    [apiFetch, getToken, playbackRate]
  );

  // Start content playback — plays intro jingle first if available
  const startContentPlayback = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;
      if (!audioRef.current) return;

      setCurrentItem(item);
      setError(null);

      const introUrl = await getJingleUrl("intro");
      if (introUrl) {
        setAdState("intro-jingle");
        setIsPlaying(true);
        setIsLoading(false);
        setCurrentTime(0);
        setDuration(0);

        const audio = audioRef.current;
        audio.playbackRate = 1;
        audio.src = introUrl;
        audio.play().catch(() => {
          beginContent(item);
        });
        return;
      }

      beginContent(item);
    },
    [beginContent]
  );

  // Ref to hold `play` for use in onPlaybackFinished (avoids circular dep)
  const playRef = useRef<(item: FeedItem) => void>(() => {});

  // Called when an item fully finishes (content + postroll). Advances queue.
  const onPlaybackFinished = useCallback(() => {
    const next = queueRef.current.shift();
    syncQueue();
    if (next) {
      playRef.current(next);
    } else {
      setAdState("none");
      setIsPlaying(false);
    }
  }, [syncQueue]);

  // IMA ads hook callbacks
  const onPrerollComplete = useCallback(() => {
    const item = pendingItemRef.current;
    if (item) {
      startContentPlayback(item);
    }
  }, [startContentPlayback]);

  const onPostrollComplete = useCallback(() => {
    onPlaybackFinished();
  }, [onPlaybackFinished]);

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

  // Check for postroll ad or end playback
  const handlePostrollOrEnd = useCallback(() => {
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
    onPlaybackFinished();
  }, [ima, onPlaybackFinished]);

  const pause = useCallback(() => {
    if (ima.isAdPlaying) {
      ima.pauseAd();
      setIsPlaying(false);
      return;
    }
    const audio = audioRef.current;
    if (audio && currentItem && adState === "content") {
      savePlaybackPosition(currentItem.id, audio.currentTime);
    }
    audio?.pause();
    setIsPlaying(false);
  }, [ima, currentItem, adState, savePlaybackPosition]);

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
    if (adState !== "content" && adState !== "none") return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, [adState]);

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current && adState !== "intro-jingle" && adState !== "outro-jingle") {
      audioRef.current.playbackRate = rate;
    }
  }, [adState]);

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
    queueRef.current = [];
    syncQueue();
    if (listenedTimerRef.current) {
      clearTimeout(listenedTimerRef.current);
      listenedTimerRef.current = null;
    }
    listenedFiredRef.current = null;
  }, [ima, syncQueue]);

  const play = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;
      if (!audioRef.current) return;

      // Save position of currently playing item before switching
      if (currentItem && adState === "content" && audioRef.current) {
        savePlaybackPosition(currentItem.id, audioRef.current.currentTime);
      }

      // Store the item for after preroll
      pendingItemRef.current = item;
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setAdState("loading-ad-config");

      // Mobile browsers require audio.play() within the synchronous
      // user-gesture context.  The ad-config fetch below is async and
      // breaks that context, so we play a tiny silent WAV first to
      // "unlock" the audio element for all subsequent plays.
      const audio = audioRef.current;
      unlockingRef.current = true;
      audio.src = UNLOCK_AUDIO;
      audio.play().catch(() => {});

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

      // Unlock phase complete — real playback starts now
      unlockingRef.current = false;

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
    [apiFetch, ima, startContentPlayback, currentItem, adState, savePlaybackPosition]
  );

  // Keep playRef in sync so onPlaybackFinished can call play without circular deps
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  const playAll = useCallback(
    (items: FeedItem[]) => {
      if (items.length === 0) return;
      const [first, ...rest] = items;
      queueRef.current = rest;
      syncQueue();
      play(first);
    },
    [play, syncQueue]
  );

  const addToQueue = useCallback((item: FeedItem) => {
    // If nothing is playing, play immediately
    if (!currentItem) {
      play(item);
    } else {
      // Avoid duplicates
      if (!queueRef.current.some((q) => q.id === item.id) && currentItem.id !== item.id) {
        queueRef.current.push(item);
        syncQueue();
      }
    }
  }, [currentItem, play, syncQueue]);

  const removeFromQueue = useCallback((itemId: string) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== itemId);
    syncQueue();
  }, [syncQueue]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    syncQueue();
  }, [syncQueue]);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    const arr = [...queueRef.current];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    queueRef.current = arr;
    syncQueue();
  }, [syncQueue]);

  const skipToQueueItem = useCallback((itemId: string) => {
    const idx = queueRef.current.findIndex((q) => q.id === itemId);
    if (idx === -1) return;
    const target = queueRef.current[idx];
    queueRef.current = queueRef.current.slice(idx + 1);
    syncQueue();
    play(target);
  }, [play, syncQueue]);

  // Handle audio ended — sequence: intro-jingle -> content -> outro-jingle -> postroll
  const handleEnded = useCallback(async () => {
    if (unlockingRef.current) return; // Ignore ended event from silent unlock WAV
    const audio = audioRef.current;

    if (adState === "intro-jingle") {
      const item = pendingItemRef.current ?? currentItem;
      if (item) {
        beginContent(item);
      }
      return;
    }

    if (adState === "content") {
      // Clear saved position — playback completed
      if (currentItem) {
        savePlaybackPosition(currentItem.id, null);
      }
      const outroUrl = await getJingleUrl("outro");
      if (outroUrl && audio) {
        setAdState("outro-jingle");
        audio.playbackRate = 1;
        audio.src = outroUrl;
        audio.play().catch(() => {
          handlePostrollOrEnd();
        });
        return;
      }

      handlePostrollOrEnd();
      return;
    }

    if (adState === "outro-jingle") {
      handlePostrollOrEnd();
      return;
    }
  }, [adState, beginContent, currentItem, handlePostrollOrEnd, savePlaybackPosition]);

  // Audio element event handlers
  const handleTimeUpdate = useCallback(() => {
    if (adState === "intro-jingle" || adState === "outro-jingle") return;
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [adState]);

  const handleLoadedMetadata = useCallback(() => {
    if (unlockingRef.current) return;
    if (adState === "intro-jingle" || adState === "outro-jingle") return;
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
      setIsLoading(false);

      // Restore playback position if saved
      const item = currentItem;
      if (
        item?.playbackPositionSeconds &&
        item.playbackPositionSeconds < audio.duration - 10
      ) {
        const resumeAt = Math.max(0, item.playbackPositionSeconds - 5);
        audio.currentTime = resumeAt;
        setCurrentTime(resumeAt);
      }
    }
  }, [adState, currentItem]);

  const handlePlay = useCallback(() => {
    if (unlockingRef.current) return;
    setIsPlaying(true);
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    if (unlockingRef.current) return;
    if (adState === "intro-jingle") {
      const item = pendingItemRef.current ?? currentItem;
      if (item) {
        beginContent(item);
      }
      return;
    }
    if (adState === "outro-jingle") {
      handlePostrollOrEnd();
      return;
    }

    setIsPlaying(false);
    setIsLoading(false);
    setError("Failed to load audio");
  }, [adState, beginContent, currentItem, handlePostrollOrEnd]);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Media Session handlers — disable seek during ads
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const isInAd = adState === "preroll" || adState === "postroll"
      || adState === "intro-jingle" || adState === "outro-jingle";

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

  // Periodic playback position save (every 10s while content is playing)
  useEffect(() => {
    if (isPlaying && adState === "content" && currentItem) {
      const itemId = currentItem.id;
      saveTimerRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          savePlaybackPosition(itemId, audio.currentTime);
        }
      }, 10000);
      return () => {
        if (saveTimerRef.current) {
          clearInterval(saveTimerRef.current);
          saveTimerRef.current = null;
        }
      };
    }
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [isPlaying, adState, currentItem, savePlaybackPosition]);

  // Mark as listened after 30s of content playback.
  // Timer starts when content plays, pauses when paused, resets on track change.
  useEffect(() => {
    if (
      isPlaying &&
      adState === "content" &&
      currentItem &&
      !currentItem.listened &&
      listenedFiredRef.current !== currentItem.id
    ) {
      const itemId = currentItem.id;
      const audio = audioRef.current;
      // Account for already-elapsed time (e.g. resumed playback)
      const isDigest = isDigestItem(currentItem);
      const listenedThreshold = isDigest ? 10 : 30; // Digest is short, mark listened sooner
      const elapsed = audio ? audio.currentTime : 0;
      const remaining = Math.max(0, listenedThreshold - elapsed) * 1000;
      listenedTimerRef.current = setTimeout(() => {
        const listenedPath = isDigest
          ? `/digest/${itemId}/listened`
          : `/feed/${itemId}/listened`;
        apiFetch(listenedPath, { method: "PATCH" }).catch(() => {});
        listenedFiredRef.current = itemId;
        listenedTimerRef.current = null;
      }, remaining);
      return () => {
        if (listenedTimerRef.current) {
          clearTimeout(listenedTimerRef.current);
          listenedTimerRef.current = null;
        }
      };
    }
  }, [isPlaying, adState, currentItem, apiFetch]);

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
    // Queue
    queue,
    // Actions
    play,
    playAll,
    pause,
    resume,
    seek,
    setRate,
    stop,
    addToQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    skipToQueueItem,
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
