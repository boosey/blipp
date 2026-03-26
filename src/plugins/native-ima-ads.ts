import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export interface NativeImaAdsPlugin {
  requestAds(options: { vastUrl: string }): Promise<void>;
  pauseAd(): Promise<void>;
  resumeAd(): Promise<void>;
  destroy(): Promise<void>;

  addListener(
    event: "adStarted",
    handler: (data: { duration: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "adCompleted",
    handler: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "adError",
    handler: (data: { message: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "adProgress",
    handler: (data: {
      currentTime: number;
      duration: number;
      progress: number;
    }) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeImaAds =
  registerPlugin<NativeImaAdsPlugin>("NativeImaAds");
