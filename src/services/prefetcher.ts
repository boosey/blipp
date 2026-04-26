import type { StorageManager } from "./storage-manager";
import { getNetworkTier, type NetworkTier } from "../lib/network-tier";
import { getApiBase } from "../lib/api-base";

export interface PrefetcherOptions {
  /** User opted into prefetching on cellular. */
  cellularEnabled: boolean;
  /** Returns the current Clerk session JWT, or null if signed out. */
  getToken?: () => Promise<string | null>;
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
  private currentBriefingId: string | null = null;
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

  cancelInflight(briefingId: string): void {
    if (this.currentBriefingId === briefingId) {
      this.currentAbort?.abort();
    }
    const idx = this.queue.indexOf(briefingId);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  resume(): void {
    this.paused = false;
    this.kickTick();
  }

  // Walks the input list past already-cached / already-queued items and
  // enqueues up to N uncached briefingIds. Used by the canplay top-up to
  // advance the cache window as the user listens — passing the full feed
  // is safe because cached items are skipped in feed order.
  async scheduleNextInQueue(queue: FeedItemLike[], n: number): Promise<void> {
    if (this.disposed) return;
    if (n <= 0) return;
    let added = 0;
    for (const item of queue) {
      if (added >= n) break;
      const id = item.briefing?.id;
      if (!id) continue;
      if (this.queue.includes(id)) continue;
      if (await this.manager.has(id)) continue;
      this.queue.push(id);
      added++;
    }
    this.kickTick();
  }

  setCellularEnabled(enabled: boolean) {
    this.opts.cellularEnabled = enabled;
  }

  async scheduleFromFeed(items: FeedItemLike[]): Promise<void> {
    if (this.disposed) return;
    const tier = await getNetworkTier();
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
    this.currentBriefingId = briefingId;
    try {
      const token = (await this.opts.getToken?.()) ?? null;
      const urlRes = await fetch(`${getApiBase()}/api/briefings/${briefingId}/audio-url`, {
        credentials: "include",
        signal: this.currentAbort.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!urlRes.ok) return;
      const body = (await urlRes.json()) as { url: string };

      // body.url is server-relative; prepend getApiBase() so native fetches
      // hit the real backend instead of resolving against the local bundle.
      const audioRes = await fetch(`${getApiBase()}${body.url}`, { signal: this.currentAbort.signal });
      if (!audioRes.ok) return;
      const blob = await audioRes.blob();
      await this.manager.store(briefingId, blob);
    } catch (err) {
      // Non-fatal — next feed event will re-enqueue. Log so prefetch
      // failures don't go entirely silent in dev.
      if ((err as any)?.name !== "AbortError") {
        console.warn("[prefetch] fetchAndStore failed", briefingId, err);
      }
    } finally {
      this.currentAbort = null;
      this.currentBriefingId = null;
    }
  }
}
