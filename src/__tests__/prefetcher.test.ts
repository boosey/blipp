import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { Prefetcher } from "../services/prefetcher";
import { StorageManager } from "../services/storage-manager";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("../lib/network-tier", () => ({
  getNetworkTier: vi.fn(() => "wifi"),
}));

// In-memory Cache API polyfill for jsdom
type CacheStore = Map<string, Response>;
const __cacheRegistry: Map<string, CacheStore> = new Map();

function makeCacheLike(store: CacheStore) {
  return {
    async match(req: RequestInfo) {
      const key = typeof req === "string" ? req : (req as Request).url;
      const r = store.get(key);
      return r ? r.clone() : undefined;
    },
    async put(req: RequestInfo, res: Response) {
      const key = typeof req === "string" ? req : (req as Request).url;
      store.set(key, res);
    },
    async delete(req: RequestInfo) {
      const key = typeof req === "string" ? req : (req as Request).url;
      return store.delete(key);
    },
  };
}

(globalThis as any).caches = {
  async open(name: string) {
    let s = __cacheRegistry.get(name);
    if (!s) {
      s = new Map();
      __cacheRegistry.set(name, s);
    }
    return makeCacheLike(s);
  },
  async delete(name: string) {
    return __cacheRegistry.delete(name);
  },
};

// Polyfill URL.createObjectURL for jsdom
if (typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = (_blob: Blob) =>
    `blob:test-${Math.random().toString(36).slice(2)}`;
}

const originalFetch = globalThis.fetch;

function makeFeedItem(briefingId: string | null) {
  return {
    id: `fi_${briefingId ?? "nil"}`,
    briefing: briefingId ? { id: briefingId } : null,
  } as any;
}

async function makeManager(): Promise<StorageManager> {
  const m = new StorageManager({ dbName: `pf-${Math.random()}` });
  await m.init();
  return m;
}

describe("Prefetcher.scheduleFromFeed", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: false });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("wifi");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("filters out items without a briefing", async () => {
    await prefetcher.scheduleFromFeed([makeFeedItem(null), makeFeedItem("br_a")]);
    expect(prefetcher.queueSize()).toBe(1);
  });

  it("filters out already-cached items", async () => {
    await manager.store("br_a", new Blob([new Uint8Array(10)]));
    await prefetcher.scheduleFromFeed([makeFeedItem("br_a"), makeFeedItem("br_b")]);
    expect(prefetcher.queueSize()).toBe(1);
  });

  it("takes the first 10 items on wifi", async () => {
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    await prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(10);
  });

  it("takes only first 2 on cellular when cellular not enabled in settings", async () => {
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("cellular");
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    await prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(0); // cellular off → no prefetch
  });

  it("takes first 2 when cellular is opted-in", async () => {
    prefetcher.dispose();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("cellular");
    const items = Array.from({ length: 15 }, (_, i) => makeFeedItem(`br_${i}`));
    await prefetcher.scheduleFromFeed(items);
    expect(prefetcher.queueSize()).toBe(2);
  });

  it("takes nothing when offline", async () => {
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("offline");
    await prefetcher.scheduleFromFeed([makeFeedItem("br_a")]);
    expect(prefetcher.queueSize()).toBe(0);
  });
});

describe("Prefetcher worker loop (single concurrency)", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: false });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("wifi");
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=tok&exp=9999999999`,
            expiresAt: 9999999999,
          }),
        } as any;
      }
      // The audio bytes
      return {
        ok: true,
        blob: async () => new Blob([new Uint8Array(64)]),
      } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("drains the queue: stores all items in StorageManager", async () => {
    const items = Array.from(
      { length: 3 },
      (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any,
    );
    await prefetcher.scheduleFromFeed(items);
    await prefetcher.drainForTesting();

    expect(await manager.has("br_0")).toBe(true);
    expect(await manager.has("br_1")).toBe(true);
    expect(await manager.has("br_2")).toBe(true);
  });

  it("never has more than one fetch in flight at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=tok&exp=999`,
            expiresAt: 999,
          }),
        } as any;
      }
      return {
        ok: true,
        blob: async () => new Blob([new Uint8Array(64)]),
      } as any;
    });

    const items = Array.from(
      { length: 5 },
      (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any,
    );
    await prefetcher.scheduleFromFeed(items);
    await prefetcher.drainForTesting();

    expect(maxInFlight).toBe(1);
  });
});

describe("Prefetcher.scheduleNextInQueue", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("wifi");
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=tok&exp=999`,
            expiresAt: 999,
          }),
        } as any;
      }
      return { ok: true, blob: async () => new Blob([new Uint8Array(64)]) } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("enqueues the next N items in a play queue", async () => {
    const queue = Array.from(
      { length: 5 },
      (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any,
    );
    await prefetcher.scheduleNextInQueue(queue, 2);
    await prefetcher.drainForTesting();
    expect(await manager.has("br_0")).toBe(true);
    expect(await manager.has("br_1")).toBe(true);
    expect(await manager.has("br_2")).toBe(false);
  });

  // Issue #7 regression: canplay top-up was passing the feed list into
  // scheduleNextInQueue, but the first N feed items are typically already
  // cached by the initial scheduleFromFeed call, so no new work was
  // enqueued. The fix is to walk past cached/duplicate items.
  it("walks past already-cached items and enqueues the next N uncached", async () => {
    // Pre-cache the first 3 feed items, mimicking the WIFI_TAKE=10 prefetch
    // window already filled by the initial scheduleFromFeed call.
    for (let i = 0; i < 3; i++) {
      await manager.store(`br_${i}`, new Blob([new Uint8Array(8)]));
    }
    const feed = Array.from(
      { length: 8 },
      (_, i) => ({ id: `fi_${i}`, briefing: { id: `br_${i}` } }) as any,
    );
    await prefetcher.scheduleNextInQueue(feed, 2);
    await prefetcher.drainForTesting();
    // The first 3 were already cached; top-up should have advanced past them.
    expect(await manager.has("br_3")).toBe(true);
    expect(await manager.has("br_4")).toBe(true);
    expect(await manager.has("br_5")).toBe(false);
  });
});

describe("Prefetcher pause/resume", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("wifi");
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=tok&exp=999`,
            expiresAt: 999,
          }),
        } as any;
      }
      return { ok: true, blob: async () => new Blob([new Uint8Array(64)]) } as any;
    });
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("does not run while paused", async () => {
    prefetcher.pause();
    await prefetcher.scheduleFromFeed([
      { id: "fi_a", briefing: { id: "br_a" } } as any,
    ]);
    // Give the loop a beat to run if it were going to.
    await new Promise((r) => setTimeout(r, 20));
    expect(await manager.has("br_a")).toBe(false);
    expect(prefetcher.queueSize()).toBeGreaterThanOrEqual(1);
  });

  it("resumes processing when resume() is called", async () => {
    prefetcher.pause();
    await prefetcher.scheduleFromFeed([
      { id: "fi_a", briefing: { id: "br_a" } } as any,
    ]);
    prefetcher.resume();
    await prefetcher.drainForTesting();
    expect(await manager.has("br_a")).toBe(true);
  });
});

describe("Prefetcher.cancelInflight", () => {
  let prefetcher: Prefetcher;
  let manager: StorageManager;

  beforeEach(async () => {
    manager = await makeManager();
    prefetcher = new Prefetcher(manager, { cellularEnabled: true });
    const { getNetworkTier } = await import("../lib/network-tier");
    (getNetworkTier as any).mockReturnValue("wifi");
  });

  afterEach(() => {
    prefetcher.dispose();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("aborts the in-flight fetch when the matching briefingId is canceled", async () => {
    const aborts: AbortSignal[] = [];
    globalThis.fetch = vi.fn((url: any, init: any = {}) => {
      aborts.push(init.signal);
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return Promise.resolve({
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=t&exp=9`,
            expiresAt: 9,
          }),
        } as any);
      }
      // Audio bytes — block until canceled.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    await prefetcher.scheduleFromFeed([
      { id: "fi_a", briefing: { id: "br_a" } } as any,
    ]);
    // Wait for fetch to start (audio-url + audio bytes call must both have
    // dispatched, so the second fetch is the one we abort).
    await new Promise((r) => setTimeout(r, 20));

    prefetcher.cancelInflight("br_a");
    await prefetcher.drainForTesting();

    expect(await manager.has("br_a")).toBe(false);
    expect(aborts.some((s) => s?.aborted)).toBe(true);
  });

  it("does nothing when canceling a different briefingId", async () => {
    let didFinish = false;
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/audio-url")) {
        const id = u.match(/briefings\/(.+?)\/audio-url/)![1];
        return {
          ok: true,
          json: async () => ({
            url: `/api/briefings/${id}/audio?t=t&exp=9`,
            expiresAt: 9,
          }),
        } as any;
      }
      didFinish = true;
      return { ok: true, blob: async () => new Blob([new Uint8Array(8)]) } as any;
    });

    await prefetcher.scheduleFromFeed([
      { id: "fi_a", briefing: { id: "br_a" } } as any,
    ]);
    prefetcher.cancelInflight("br_other");
    await prefetcher.drainForTesting();

    expect(didFinish).toBe(true);
    expect(await manager.has("br_a")).toBe(true);
  });
});
