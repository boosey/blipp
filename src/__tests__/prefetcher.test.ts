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
