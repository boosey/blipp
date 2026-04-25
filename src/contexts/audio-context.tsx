import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FeedItem } from "../types/feed";
import { useApiFetch } from "../lib/api-client";
import { getJingleUrl } from "../lib/jingle-cache";
import { useStorage } from "./storage-context";

// Minimal silent WAV (22050Hz, 16-bit mono, 2 samples) used to "unlock"
// the HTMLAudioElement on mobile within the user-gesture context.  Mobile
// browsers block audio.play() after any `await`, so we play this silence
// synchronously before fetching the intro jingle.
const UNLOCK_AUDIO =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAAAA";

type PlaybackPhase = "none" | "content" | "intro-jingle" | "outro-jingle";

interface AudioState {
  currentItem: FeedItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
  playbackPhase: PlaybackPhase;
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
  const { manager: storageManager, prefetcher } = useStorage();

  const [currentItem, setCurrentItem] = useState<FeedItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playbackPhase, setPlaybackPhase] = useState<PlaybackPhase>("none");
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

  const savePlaybackPosition = useCallback(
    (itemId: string, position: number | null) => {
      apiFetch(`/feed/${itemId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ positionSeconds: position }),
      }).catch(() => {});
    },
    [apiFetch]
  );

  // Begin content playback — sets src to briefing audio, fires listened PATCH
  const beginContent = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;

      setPlaybackPhase("content");
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);

      const audio = audioRef.current;
      if (!audio) return;

      try {
        const url = await storageManager.getPlayableUrl(item.briefing.id);
        audio.src = url;
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
    [storageManager, playbackRate]
  );

  // Start content playback — plays intro jingle first if available
  const startContentPlayback = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;
      if (!audioRef.current) return;

      setCurrentItem(item);
      setError(null);

      const introUrl = await getJingleUrl("intro");
      // After the first await, the silent unlock WAV has had a chance to fire
      // its events — safe to let real audio events through now.
      unlockingRef.current = false;

      if (introUrl) {
        setPlaybackPhase("intro-jingle");
        setIsPlaying(true);
        setIsLoading(false);
        setCurrentTime(0);
        setDuration(0);

        const audio = audioRef.current;
        audio.playbackRate = 1;
        audio.src = introUrl;
        audio.play().catch((err) => {
          console.warn("[audio] intro jingle play() rejected", err);
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

  // Called when an item fully finishes. Advances queue.
  const onPlaybackFinished = useCallback(() => {
    const next = queueRef.current.shift();
    syncQueue();
    if (next) {
      playRef.current(next);
    } else {
      setPlaybackPhase("none");
      setIsPlaying(false);
    }
  }, [syncQueue]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && currentItem && playbackPhase === "content") {
      savePlaybackPosition(currentItem.id, audio.currentTime);
    }
    audio?.pause();
    setIsPlaying(false);
  }, [currentItem, playbackPhase, savePlaybackPosition]);

  const resume = useCallback(() => {
    audioRef.current?.play();
    setIsPlaying(true);
  }, []);

  const seek = useCallback((time: number) => {
    if (playbackPhase !== "content" && playbackPhase !== "none") return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, [playbackPhase]);

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current && playbackPhase !== "intro-jingle" && playbackPhase !== "outro-jingle") {
      audioRef.current.playbackRate = rate;
    }
  }, [playbackPhase]);

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
    setPlaybackPhase("none");
    queueRef.current = [];
    syncQueue();
    if (listenedTimerRef.current) {
      clearTimeout(listenedTimerRef.current);
      listenedTimerRef.current = null;
    }
    listenedFiredRef.current = null;
  }, [syncQueue]);

  const play = useCallback(
    (item: FeedItem) => {
      if (!item.briefing) return;
      if (!audioRef.current) return;

      // Save position of currently playing item before switching
      if (currentItem && playbackPhase === "content" && audioRef.current) {
        savePlaybackPosition(currentItem.id, audioRef.current.currentTime);
      }

      setCurrentItem(item);
      setError(null);
      setIsLoading(true);

      // Mobile browsers require audio.play() within the synchronous
      // user-gesture context. The jingle lookup below is async and breaks
      // that context, so we play a tiny silent WAV first to "unlock" the
      // audio element for all subsequent plays.
      const audio = audioRef.current;
      unlockingRef.current = true;
      audio.src = UNLOCK_AUDIO;
      audio.play().catch(() => {});

      startContentPlayback(item);
    },
    [currentItem, playbackPhase, savePlaybackPosition, startContentPlayback]
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

  // Handle audio ended — sequence: intro-jingle -> content -> outro-jingle -> next
  const handleEnded = useCallback(async () => {
    if (unlockingRef.current) return; // Ignore ended event from silent unlock WAV
    const audio = audioRef.current;

    if (playbackPhase === "intro-jingle") {
      if (currentItem) {
        beginContent(currentItem);
      }
      return;
    }

    if (playbackPhase === "content") {
      // Clear saved position — playback completed
      if (currentItem) {
        savePlaybackPosition(currentItem.id, null);
      }
      const outroUrl = await getJingleUrl("outro");
      if (outroUrl && audio) {
        setPlaybackPhase("outro-jingle");
        audio.playbackRate = 1;
        audio.src = outroUrl;
        audio.play().catch((err) => {
          console.warn("[audio] outro jingle play() rejected", err);
          onPlaybackFinished();
        });
        return;
      }

      onPlaybackFinished();
      return;
    }

    if (playbackPhase === "outro-jingle") {
      onPlaybackFinished();
      return;
    }
  }, [playbackPhase, beginContent, currentItem, onPlaybackFinished, savePlaybackPosition]);

  // Audio element event handlers
  const handleTimeUpdate = useCallback(() => {
    if (playbackPhase === "intro-jingle" || playbackPhase === "outro-jingle") return;
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [playbackPhase]);

  const handleLoadedMetadata = useCallback(() => {
    if (unlockingRef.current) return;
    if (playbackPhase === "intro-jingle" || playbackPhase === "outro-jingle") return;
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
  }, [playbackPhase, currentItem]);

  const handlePlay = useCallback(() => {
    if (unlockingRef.current) return;
    setIsPlaying(true);
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    if (unlockingRef.current) return;
    const audioErr = audioRef.current?.error;
    if (playbackPhase === "intro-jingle") {
      console.warn("[audio] intro jingle element error", audioErr?.code, audioErr?.message);
      if (currentItem) {
        beginContent(currentItem);
      }
      return;
    }
    if (playbackPhase === "outro-jingle") {
      console.warn("[audio] outro jingle element error", audioErr?.code, audioErr?.message);
      onPlaybackFinished();
      return;
    }

    setIsPlaying(false);
    setIsLoading(false);
    setError("Failed to load audio");
  }, [playbackPhase, beginContent, currentItem, onPlaybackFinished]);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    if (queueRef.current && queueRef.current.length > 0) {
      void prefetcher.scheduleNextInQueue(queueRef.current, 2);
    }
  }, [prefetcher]);

  // Media Session handlers — disable seek during jingles
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const isInJingle = playbackPhase === "intro-jingle" || playbackPhase === "outro-jingle";

    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());

    if (isInJingle) {
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
  }, [playbackPhase, pause, resume, seek]);

  // Periodic playback position save (every 10s while content is playing)
  useEffect(() => {
    if (isPlaying && playbackPhase === "content" && currentItem) {
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
  }, [isPlaying, playbackPhase, currentItem, savePlaybackPosition]);

  // Mark as listened after 30s of content playback.
  // Timer starts when content plays, pauses when paused, resets on track change.
  useEffect(() => {
    if (
      isPlaying &&
      playbackPhase === "content" &&
      currentItem &&
      !currentItem.listened &&
      listenedFiredRef.current !== currentItem.id
    ) {
      const itemId = currentItem.id;
      const briefingId = currentItem.briefing?.id;
      const audio = audioRef.current;
      // Account for already-elapsed time (e.g. resumed playback)
      const elapsed = audio ? audio.currentTime : 0;
      const remaining = Math.max(0, 30 - elapsed) * 1000;
      listenedTimerRef.current = setTimeout(() => {
        apiFetch(`/feed/${itemId}/listened`, { method: "PATCH" }).catch(() => {});
        if (briefingId) {
          storageManager.markListened(briefingId).catch(() => {});
        }
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
  }, [isPlaying, playbackPhase, currentItem, apiFetch, storageManager]);

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
    playbackPhase,
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
