import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@clerk/clerk-react";
import type { PluginListenerHandle } from "@capacitor/core";
import type { FeedItem } from "../types/feed";
import type { AdConfig, AdState } from "../types/ads";
import { useApiFetch } from "../lib/api";
import { useImaAds } from "../hooks/use-ima-ads";
import { getJingleUrl } from "../lib/jingle-cache";
import { getApiBase } from "../lib/api-base";
import { NativeAudio } from "../plugins/native-audio";
import { NativeImaAds } from "../plugins/native-ima-ads";

const isNative = Capacitor.isNativePlatform();

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

  // Queue for Play All
  const queueRef = useRef<FeedItem[]>([]);

  // Native ad state (replaces ima.* on native platform)
  const [nativeAdPlaying, setNativeAdPlaying] = useState(false);
  const [nativeAdProgress, setNativeAdProgress] = useState(0);
  const [nativeAdDuration, setNativeAdDuration] = useState(0);
  const [nativeAdCurrentTime, setNativeAdCurrentTime] = useState(0);

  // Native audio listener handles
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);
  // Track adState in a ref so native callbacks see the latest value
  const adStateRef = useRef<AdState>("none");
  adStateRef.current = adState;

  // --- Native audio helpers ---

  const nativePlay = useCallback(
    async (url: string, rate: number) => {
      const token = await getToken();
      const fullUrl = `${getApiBase()}${url}`;
      await NativeAudio.play({
        url: fullUrl,
        token: token ?? undefined,
        rate,
      });
    },
    [getToken]
  );

  // Begin content playback — sets src to briefing audio, fires listened PATCH
  const beginContent = useCallback(
    (item: FeedItem) => {
      if (!item.briefing) return;

      setAdState("content");
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);

      if (isNative) {
        nativePlay(`/api/briefings/${item.briefing.id}/audio`, playbackRate).catch(() => {
          setIsLoading(false);
          setError("Failed to play audio");
        });
      } else {
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = `/api/briefings/${item.briefing.id}/audio`;
        audio.playbackRate = playbackRate;
        audio.play().catch(() => {
          setIsLoading(false);
          setError("Failed to play audio");
        });
      }

      // Fire-and-forget listened PATCH
      if (!item.listened) {
        apiFetch(`/feed/${item.id}/listened`, { method: "PATCH" }).catch(
          () => {}
        );
      }

      // Media Session API (web only — native handles this via MPNowPlayingInfoCenter)
      if (!isNative && "mediaSession" in navigator) {
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
    [apiFetch, playbackRate, nativePlay]
  );

  // Start content playback — plays intro jingle first if available
  const startContentPlayback = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;
      if (!isNative && !audioRef.current) return;

      setCurrentItem(item);
      setError(null);

      if (isNative) {
        // On native, play jingle URLs via the native player too.
        // Jingles are served from the API, so use full URL + auth.
        const introUrl = "/api/assets/jingles/intro.mp3";
        setAdState("intro-jingle");
        setIsPlaying(true);
        setIsLoading(false);
        setCurrentTime(0);
        setDuration(0);

        nativePlay(introUrl, 1).catch(() => {
          // Jingle failed — go straight to content
          beginContent(item);
        });
        return;
      }

      // Web path
      const introUrl = await getJingleUrl("intro");
      if (introUrl) {
        setAdState("intro-jingle");
        setIsPlaying(true);
        setIsLoading(false);
        setCurrentTime(0);
        setDuration(0);

        const audio = audioRef.current!;
        audio.playbackRate = 1;
        audio.src = introUrl;
        audio.play().catch(() => {
          beginContent(item);
        });
        return;
      }

      beginContent(item);
    },
    [beginContent, nativePlay]
  );

  // Ref to hold `play` for use in onPlaybackFinished (avoids circular dep)
  const playRef = useRef<(item: FeedItem) => void>(() => {});

  // Called when an item fully finishes (content + postroll). Advances queue.
  const onPlaybackFinished = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      playRef.current(next);
    } else {
      setAdState("none");
      setIsPlaying(false);
    }
  }, []);

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
      if (isNative) {
        NativeImaAds.requestAds({ vastUrl: config.postroll.vastTagUrl });
      } else {
        ima.requestAds(config.postroll.vastTagUrl);
      }
      return;
    }
    onPlaybackFinished();
  }, [ima, onPlaybackFinished]);

  // Refs for callbacks that native listeners need (avoids stale closures)
  const beginContentRef = useRef(beginContent);
  beginContentRef.current = beginContent;
  const handlePostrollOrEndRef = useRef(handlePostrollOrEnd);
  handlePostrollOrEndRef.current = handlePostrollOrEnd;
  const handleAdCompleteRef = useRef(handleAdComplete);
  handleAdCompleteRef.current = handleAdComplete;

  // --- Native audio event listeners ---
  useEffect(() => {
    if (!isNative) return;

    const listeners: Promise<PluginListenerHandle>[] = [];

    listeners.push(
      NativeAudio.addListener("timeUpdate", (data) => {
        const state = adStateRef.current;
        if (state === "intro-jingle" || state === "outro-jingle") return;
        setCurrentTime(data.currentTime);
        setDuration(data.duration);
      })
    );

    listeners.push(
      NativeAudio.addListener("loaded", (data) => {
        const state = adStateRef.current;
        if (state !== "intro-jingle" && state !== "outro-jingle") {
          setDuration(data.duration);
        }
        setIsLoading(false);
      })
    );

    listeners.push(
      NativeAudio.addListener("ended", () => {
        const state = adStateRef.current;

        if (state === "intro-jingle") {
          const item = pendingItemRef.current;
          if (item) {
            beginContentRef.current(item);
          }
          return;
        }

        if (state === "content") {
          // Play outro jingle before postroll
          const outroUrl = "/api/assets/jingles/outro.mp3";
          setAdState("outro-jingle");
          nativePlay(outroUrl, 1).catch(() => {
            handlePostrollOrEndRef.current();
          });
          return;
        }

        if (state === "outro-jingle") {
          handlePostrollOrEndRef.current();
          return;
        }
      })
    );

    listeners.push(
      NativeAudio.addListener("error", (data) => {
        const state = adStateRef.current;
        if (state === "intro-jingle") {
          const item = pendingItemRef.current;
          if (item) beginContentRef.current(item);
          return;
        }
        if (state === "outro-jingle") {
          handlePostrollOrEndRef.current();
          return;
        }
        setIsPlaying(false);
        setIsLoading(false);
        setError(data.message || "Failed to load audio");
      })
    );

    listeners.push(
      NativeAudio.addListener("remotePlay", () => {
        setIsPlaying(true);
      })
    );

    listeners.push(
      NativeAudio.addListener("remotePause", () => {
        setIsPlaying(false);
      })
    );

    listeners.push(
      NativeAudio.addListener("interrupted", (data) => {
        if (data.reason === "began") {
          setIsPlaying(false);
        } else if (data.reason === "ended-resume") {
          setIsPlaying(true);
        }
      })
    );

    Promise.all(listeners).then((handles) => {
      nativeListenersRef.current = handles;
    });

    return () => {
      nativeListenersRef.current.forEach((h) => h.remove());
      nativeListenersRef.current = [];
    };
  }, [nativePlay]);

  // --- Native IMA ads event listeners ---
  const nativeImaListenersRef = useRef<PluginListenerHandle[]>([]);

  useEffect(() => {
    if (!isNative) return;

    const listeners: Promise<PluginListenerHandle>[] = [];

    listeners.push(
      NativeImaAds.addListener("adStarted", (data) => {
        setNativeAdPlaying(true);
        setNativeAdDuration(data.duration);
        setNativeAdCurrentTime(0);
        setNativeAdProgress(0);
      })
    );

    listeners.push(
      NativeImaAds.addListener("adCompleted", () => {
        setNativeAdPlaying(false);
        setNativeAdProgress(0);
        setNativeAdDuration(0);
        setNativeAdCurrentTime(0);
        handleAdCompleteRef.current();
      })
    );

    listeners.push(
      NativeImaAds.addListener("adError", () => {
        setNativeAdPlaying(false);
        // Error = skip ad, handleAdComplete will advance the flow
        handleAdCompleteRef.current();
      })
    );

    listeners.push(
      NativeImaAds.addListener("adProgress", (data) => {
        setNativeAdCurrentTime(data.currentTime);
        setNativeAdDuration(data.duration);
        setNativeAdProgress(data.progress);
      })
    );

    Promise.all(listeners).then((handles) => {
      nativeImaListenersRef.current = handles;
    });

    return () => {
      nativeImaListenersRef.current.forEach((h) => h.remove());
      nativeImaListenersRef.current = [];
    };
  }, []);

  const pause = useCallback(() => {
    if (isNative ? nativeAdPlaying : ima.isAdPlaying) {
      if (isNative) {
        NativeImaAds.pauseAd();
      } else {
        ima.pauseAd();
      }
      setIsPlaying(false);
      return;
    }
    if (isNative) {
      NativeAudio.pause();
    } else {
      audioRef.current?.pause();
    }
    setIsPlaying(false);
  }, [ima]);

  const resume = useCallback(() => {
    if (isNative ? nativeAdPlaying : ima.isAdPlaying) {
      if (isNative) {
        NativeImaAds.resumeAd();
      } else {
        ima.resumeAd();
      }
      setIsPlaying(true);
      return;
    }
    if (isNative) {
      NativeAudio.resume();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(true);
  }, [ima]);

  const seek = useCallback((time: number) => {
    if (adState !== "content" && adState !== "none") return;
    if (isNative) {
      NativeAudio.seek({ time });
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = time;
    }
    setCurrentTime(time);
  }, [adState]);

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (isNative) {
      if (adState !== "intro-jingle" && adState !== "outro-jingle") {
        NativeAudio.setRate({ rate });
      }
    } else if (audioRef.current && adState !== "intro-jingle" && adState !== "outro-jingle") {
      audioRef.current.playbackRate = rate;
    }
  }, [adState]);

  const stop = useCallback(() => {
    if (isNative) {
      NativeAudio.stop();
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    }
    if (isNative) {
      NativeImaAds.destroy();
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
  }, [ima]);

  const play = useCallback(
    async (item: FeedItem) => {
      if (!item.briefing) return;
      if (!isNative && !audioRef.current) return;

      // Store the item for after preroll
      pendingItemRef.current = item;
      setCurrentItem(item);
      setError(null);
      setIsLoading(true);
      setAdState("loading-ad-config");

      if (!isNative) {
        // Mobile browsers require audio.play() within the synchronous
        // user-gesture context.  The ad-config fetch below is async and
        // breaks that context, so we play a tiny silent WAV first to
        // "unlock" the audio element for all subsequent plays.
        const audio = audioRef.current!;
        unlockingRef.current = true;
        audio.src = UNLOCK_AUDIO;
        audio.play().catch(() => {});
      }

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
        if (isNative) {
          NativeImaAds.requestAds({ vastUrl: config.preroll.vastTagUrl });
        } else {
          ima.requestAds(config.preroll.vastTagUrl);
        }
        return;
      }

      // No preroll — start content directly
      startContentPlayback(item);
    },
    [apiFetch, ima, startContentPlayback]
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
      play(first);
    },
    [play]
  );

  // Handle audio ended — sequence: intro-jingle → content → outro-jingle → postroll
  // (Web only — native uses event listeners above)
  const handleEnded = useCallback(async () => {
    if (isNative) return;
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
  }, [adState, beginContent, currentItem, handlePostrollOrEnd]);

  // Audio element event handlers (web only)
  const handleTimeUpdate = useCallback(() => {
    if (adState === "intro-jingle" || adState === "outro-jingle") return;
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [adState]);

  const handleLoadedMetadata = useCallback(() => {
    if (unlockingRef.current) return;
    if (adState === "intro-jingle" || adState === "outro-jingle") return;
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  }, [adState]);

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

  // Media Session handlers — disable seek during ads (web only)
  useEffect(() => {
    if (isNative) return;
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

  // Sync mediaSession position state (web only)
  useEffect(() => {
    if (isNative) return;
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
    isAdPlaying: isNative ? nativeAdPlaying : ima.isAdPlaying,
    adProgress: isNative ? nativeAdProgress : ima.adProgress,
    adDuration: isNative ? nativeAdDuration : ima.adDuration,
    adCurrentTime: isNative ? nativeAdCurrentTime : ima.adCurrentTime,
    // Actions
    play,
    playAll,
    pause,
    resume,
    seek,
    setRate,
    stop,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
      {/* Web audio element — not used on native */}
      {!isNative && (
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
      )}
    </AudioContext.Provider>
  );
}
