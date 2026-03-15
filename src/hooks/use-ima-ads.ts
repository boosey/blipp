import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      ima: {
        AdDisplayContainer: new (container: HTMLElement, video?: HTMLElement) => {
          initialize: () => void;
          destroy: () => void;
        };
        AdsLoader: new (container: {
          initialize: () => void;
          destroy: () => void;
        }) => {
          addEventListener: (event: string, handler: (e: any) => void, useCapture?: boolean) => void;
          requestAds: (request: any) => void;
          contentComplete: () => void;
          destroy: () => void;
        };
        AdsRequest: new () => {
          adTagUrl: string;
          linearAdSlotWidth: number;
          linearAdSlotHeight: number;
        };
        AdsManagerLoadedEvent: {
          Type: { ADS_MANAGER_LOADED: string };
        };
        AdErrorEvent: {
          Type: { AD_ERROR: string };
        };
        AdEvent: {
          Type: {
            CONTENT_PAUSE_REQUESTED: string;
            CONTENT_RESUME_REQUESTED: string;
            ALL_ADS_COMPLETED: string;
            AD_ERROR: string;
            AD_PROGRESS: string;
            STARTED: string;
            COMPLETE: string;
            LOADED: string;
          };
        };
        ViewMode: { NORMAL: string };
        AdsRenderingSettings: new () => {
          restoreCustomPlaybackStateOnAdBreakComplete: boolean;
        };
      };
    };
  }
}

interface UseImaAdsOptions {
  onAdStart?: () => void;
  onAdComplete?: () => void;
  onAdError?: () => void;
}

interface UseImaAdsReturn {
  requestAds: (vastUrl: string) => void;
  isAdPlaying: boolean;
  adProgress: number;
  adDuration: number;
  adCurrentTime: number;
  pauseAd: () => void;
  resumeAd: () => void;
  setAdVolume: (volume: number) => void;
  destroy: () => void;
}

export function useImaAds(options: UseImaAdsOptions = {}): UseImaAdsReturn {
  const { onAdStart, onAdComplete, onAdError } = options;

  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [adProgress, setAdProgress] = useState(0);
  const [adDuration, setAdDuration] = useState(0);
  const [adCurrentTime, setAdCurrentTime] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const adAudioRef = useRef<HTMLAudioElement | null>(null);
  const adDisplayContainerRef = useRef<any>(null);
  const adsLoaderRef = useRef<any>(null);
  const adsManagerRef = useRef<any>(null);
  const callbacksRef = useRef({ onAdStart, onAdComplete, onAdError });

  useEffect(() => {
    callbacksRef.current = { onAdStart, onAdComplete, onAdError };
  }, [onAdStart, onAdComplete, onAdError]);

  // Create hidden container and audio element on mount
  useEffect(() => {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;pointer-events:none;";
    document.body.appendChild(container);
    containerRef.current = container;

    const audio = document.createElement("audio");
    audio.style.display = "none";
    document.body.appendChild(audio);
    adAudioRef.current = audio;

    return () => {
      container.remove();
      audio.remove();
    };
  }, []);

  const destroyManager = useCallback(() => {
    if (adsManagerRef.current) {
      adsManagerRef.current.destroy();
      adsManagerRef.current = null;
    }
    setIsAdPlaying(false);
    setAdProgress(0);
    setAdDuration(0);
    setAdCurrentTime(0);
  }, []);

  const destroy = useCallback(() => {
    destroyManager();
    if (adsLoaderRef.current) {
      adsLoaderRef.current.destroy();
      adsLoaderRef.current = null;
    }
    if (adDisplayContainerRef.current) {
      adDisplayContainerRef.current.destroy();
      adDisplayContainerRef.current = null;
    }
  }, [destroyManager]);

  const requestAds = useCallback(
    (vastUrl: string) => {
      const ima = window.google?.ima;
      if (!ima) {
        // IMA SDK not available (ad blocker) — skip ads gracefully
        callbacksRef.current.onAdComplete?.();
        return;
      }

      // Clean up previous
      destroyManager();

      const container = containerRef.current!;
      const audio = adAudioRef.current!;

      const adDisplayContainer = new ima.AdDisplayContainer(container, audio);
      adDisplayContainer.initialize();
      adDisplayContainerRef.current = adDisplayContainer;

      const adsLoader = new ima.AdsLoader(adDisplayContainer);
      adsLoaderRef.current = adsLoader;

      adsLoader.addEventListener(
        ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (adsManagerLoadedEvent: any) => {
          const renderingSettings = new ima.AdsRenderingSettings();
          renderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

          const adsManager = adsManagerLoadedEvent.getAdsManager(audio, renderingSettings);
          adsManagerRef.current = adsManager;

          adsManager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
            setIsAdPlaying(true);
            callbacksRef.current.onAdStart?.();
          });

          adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
            setIsAdPlaying(false);
          });

          adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
            setIsAdPlaying(false);
            destroyManager();
            callbacksRef.current.onAdComplete?.();
          });

          adsManager.addEventListener(ima.AdEvent.Type.AD_ERROR, () => {
            setIsAdPlaying(false);
            destroyManager();
            callbacksRef.current.onAdError?.();
            callbacksRef.current.onAdComplete?.();
          });

          adsManager.addEventListener(ima.AdEvent.Type.AD_PROGRESS, (e: any) => {
            const adData = e.getAdData();
            if (adData) {
              const current = adData.currentTime !== undefined ? adData.currentTime : 0;
              const total = adData.duration || 0;
              setAdDuration(total);
              setAdCurrentTime(current);
              setAdProgress(total > 0 ? current / total : 0);
            }
          });

          adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
            const ad = adsManager.getCurrentAd?.();
            if (ad) {
              setAdDuration(ad.getDuration?.() || 0);
            }
          });

          try {
            adsManager.init(1, 1, ima.ViewMode.NORMAL);
            adsManager.start();
          } catch {
            destroyManager();
            callbacksRef.current.onAdComplete?.();
          }
        },
        false
      );

      adsLoader.addEventListener(
        ima.AdErrorEvent.Type.AD_ERROR,
        () => {
          callbacksRef.current.onAdError?.();
          callbacksRef.current.onAdComplete?.();
        },
        false
      );

      const adsRequest = new ima.AdsRequest();
      adsRequest.adTagUrl = vastUrl;
      adsRequest.linearAdSlotWidth = 1;
      adsRequest.linearAdSlotHeight = 1;
      adsLoader.requestAds(adsRequest);
    },
    [destroyManager]
  );

  const pauseAd = useCallback(() => {
    adsManagerRef.current?.pause();
  }, []);

  const resumeAd = useCallback(() => {
    adsManagerRef.current?.resume();
  }, []);

  const setAdVolume = useCallback((volume: number) => {
    adsManagerRef.current?.setVolume(volume);
  }, []);

  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    requestAds,
    isAdPlaying,
    adProgress,
    adDuration,
    adCurrentTime,
    pauseAd,
    resumeAd,
    setAdVolume,
    destroy,
  };
}
