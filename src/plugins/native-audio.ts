import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export interface NativeAudioPlugin {
  play(options: {
    url: string;
    token?: string;
    rate?: number;
  }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(options: { time: number }): Promise<void>;
  setRate(options: { rate: number }): Promise<void>;
  stop(): Promise<void>;
  getCurrentTime(): Promise<{ time: number }>;
  getDuration(): Promise<{ duration: number }>;

  addListener(
    event: "timeUpdate",
    handler: (data: { currentTime: number; duration: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "loaded",
    handler: (data: { duration: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "ended",
    handler: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "error",
    handler: (data: { message: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "remotePlay",
    handler: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "remotePause",
    handler: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "remoteSeekBackward",
    handler: (data: { time: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "remoteSeekForward",
    handler: (data: { time: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "interrupted",
    handler: (data: { reason: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeAudio = registerPlugin<NativeAudioPlugin>("NativeAudio");
