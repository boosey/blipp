import type { StorageManager } from "./storage-manager";
import { getNetworkTier, type NetworkTier } from "../lib/network-tier";

export interface PrefetcherOptions {
  /** User opted into prefetching on cellular. */
  cellularEnabled: boolean;
}

interface FeedItemLike {
  id: string;
  briefing?: { id: string } | null;
}

const WIFI_TAKE = 10;
const CELLULAR_TAKE = 2;

export class Prefetcher {
  private manager: StorageManager;
  private opts: PrefetcherOptions;
  private queue: string[] = [];
  private running = false;
  private disposed = false;
  private currentAbort: AbortController | null = null;
  private tickPending = false;
  private paused = false;
  private onlineHandler = () => this.resume();
  private offlineHandler = () => this.pause();

  constructor(manager: StorageManager, opts: PrefetcherOptions) {
    this.manager = manager;
    this.opts = opts;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
    }
  }

  pause(): void {
    this.paused = true;
    this.currentAbort?.abort();
  }

  resume(): void {
    this.paused = false;
    this.kickTick();
  }

  async scheduleNextInQueue(queue: FeedItemLike[], n: number): Promise<void> {
    if (this.disposed) return;
    if (n <= 0) return;
    const candidates: string[] = [];
    for (const item of queue) {
      if (!item.briefing?.id) continue;
      candidates.push(item.briefing.id);
      if (candidates.length >= n) break;
    }
    await this.enqueueFiltered(candidates);
    this.kickTick();
  }

  setCellularEnabled(enabled: boolean) {
    this.opts.cellularEnabled = enabled;
  }

  async scheduleFromFeed(items: FeedItemLike[]): Promise<void> {
    if (this.disposed) return;
    const tier = getNetworkTier();
    const take = this.takeForTier(tier);
    if (take === 0) return;

    const candidates: string[] = [];
    for (const item of items) {
      if (!item.briefing?.id) continue;
      candidates.push(item.briefing.id);
      if (candidates.length >= take) break;
    }

    await this.enqueueFiltered(candidates);
    // Defer tick to a macrotask so callers can synchronously observe
    // queueSize() right after awaiting scheduleFromFeed before processing
    // begins.
    this.kickTick();
  }

  private kickTick(): void {
    if (this.disposed) return;
    if (this.tickPending) return;
    this.tickPending = true;
    setTimeout(() => {
      this.tickPending = false;
      void this.tick();
    }, 0);
  }

  queueSize(): number {
    return this.queue.length;
  }

  /** For tests: drain the queue to completion. */
  async drainForTesting(): Promise<void> {
    while (this.queue.length > 0 || this.running || this.tickPending) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.currentAbort?.abort();
    this.currentAbort = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("offline", this.offlineHandler);
    }
  }

  private takeForTier(tier: NetworkTier): number {
    if (tier === "offline") return 0;
    if (tier === "wifi") return WIFI_TAKE;
    if (tier === "cellular") return this.opts.cellularEnabled ? CELLULAR_TAKE : 0;
    return 0;
  }

  private async enqueueFiltered(briefingIds: string[]): Promise<void> {
    for (const id of briefingIds) {
      if (this.queue.includes(id)) continue;
      if (await this.manager.has(id)) continue;
      this.queue.push(id);
    }
  }

  private async tick(): Promise<void> {
    if (this.running || this.disposed || this.paused) return;
    if (this.queue.length === 0) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.disposed && !this.paused) {
        const id = this.queue.shift()!;
        if (await this.manager.has(id)) continue;
        await this.fetchAndStore(id);
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchAndStore(briefingId: string): Promise<void> {
    this.currentAbort = new AbortController();
    try {
      const urlRes = await fetch(`/api/briefings/${briefingId}/audio-url`, {
        credentials: "include",
        signal: this.currentAbort.signal,
      });
      if (!urlRes.ok) return;
      const body = (await urlRes.json()) as { url: string };

      const audioRes = await fetch(body.url, { signal: this.currentAbort.signal });
      if (!audioRes.ok) return;
      const blob = await audioRes.blob();
      await this.manager.store(briefingId, blob);
    } catch {
      // Silent. Next feed event will re-enqueue.
    } finally {
      this.currentAbort = null;
    }
  }
}
