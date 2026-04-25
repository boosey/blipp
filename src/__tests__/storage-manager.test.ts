import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import "fake-indexeddb/auto";
import { StorageManager } from "../services/storage-manager";

// Capacitor mock — non-native path so writeBlob/readBlob use Cache API
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
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
  (URL as any).createObjectURL = (_blob: Blob) => `blob:test-${Math.random().toString(36).slice(2)}`;
}

const originalFetch = globalThis.fetch;

function makeBlob(bytes = 1024) {
  const arr = new Uint8Array(bytes);
  return new Blob([arr]);
}

describe("StorageManager.getPlayableUrl", () => {
  let manager: StorageManager;
  let dbName: string;

  beforeEach(async () => {
    __cacheRegistry.clear();
    dbName = `blipp-storage-test-${Math.random().toString(36).slice(2)}`;
    manager = new StorageManager({ dbName });
    await manager.init();
    globalThis.fetch = vi.fn();
  });

  it("returns a local URL on cache hit without calling fetch", async () => {
    const blob = makeBlob();
    await manager.store("br_1", blob);

    const url = await manager.getPlayableUrl("br_1");
    expect(url).toMatch(/^blob:|^file:|^\//); // Cache API resolves later; here we expect blob://
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("on cache miss, fetches signed URL and returns it", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "/api/briefings/br_2/audio?t=abc&exp=999",
        expiresAt: 999,
      }),
    });

    const url = await manager.getPlayableUrl("br_2");
    expect(url).toBe("/api/briefings/br_2/audio?t=abc&exp=999");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/briefings/br_2/audio-url",
      expect.any(Object),
    );
  });

  it("on cache hit but readBlob returns null, treats as miss and removes manifest entry", async () => {
    const blob = makeBlob();
    await manager.store("br_3", blob);
    // Wipe the underlying Cache so readBlob returns null. The StorageManager's
    // writeBlob writes into the cache named after the constant DB_NAME ("blipp-storage"),
    // not the configured dbName, so we wipe that registry slot.
    __cacheRegistry.clear();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "/api/briefings/br_3/audio?t=xyz&exp=999",
        expiresAt: 999,
      }),
    });

    const url = await manager.getPlayableUrl("br_3");
    expect(url).toBe("/api/briefings/br_3/audio?t=xyz&exp=999");
    const entry = await manager.getEntry("br_3");
    expect(entry).toBeUndefined(); // stale entry was removed
  });

  it("throws when the signed-URL fetch fails", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(manager.getPlayableUrl("br_4")).rejects.toThrow();
  });
});

describe("StorageManager.pruneNotInFeed", () => {
  let manager: StorageManager;

  beforeEach(async () => {
    __cacheRegistry.clear();
    const dbName = `blipp-storage-test-${Math.random().toString(36).slice(2)}`;
    manager = new StorageManager({ dbName });
    await manager.init();
  });

  it("removes entries not in the active feed", async () => {
    await manager.store("br_keep", makeBlob());
    await manager.store("br_drop", makeBlob());

    await manager.pruneNotInFeed(["br_keep"]);

    expect(await manager.has("br_keep")).toBe(true);
    expect(await manager.has("br_drop")).toBe(false);
  });

  it("does not remove the currently-playing entry even if it's not in the feed", async () => {
    await manager.store("br_playing", makeBlob());
    manager.setCurrentlyPlaying("br_playing");

    await manager.pruneNotInFeed([]); // empty active list

    expect(await manager.has("br_playing")).toBe(true);
  });
});

describe("StorageManager eviction policy (evictUntilFits)", () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const BUDGET = 100;

  let manager: StorageManager;

  beforeEach(async () => {
    __cacheRegistry.clear();
    // Fake only Date — leave setTimeout / queueMicrotask real so fake-indexeddb's
    // async dispatch still runs.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const dbName = `blipp-storage-test-${Math.random().toString(36).slice(2)}`;
    manager = new StorageManager({ dbName, budgetBytes: BUDGET });
    await manager.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts listened-stale (>24h) entries oldest-listenedAt first", async () => {
    // Two stale-listened entries (different listenedAt) + one recent-listened + one unlistened.
    vi.setSystemTime(NOW - 7 * DAY);
    await manager.store("br_old_stale", makeBlob(25));
    vi.setSystemTime(NOW - 3 * DAY);
    await manager.markListened("br_old_stale"); // stale: 3d ago

    vi.setSystemTime(NOW - 6 * DAY);
    await manager.store("br_new_stale", makeBlob(25));
    vi.setSystemTime(NOW - 2 * DAY);
    await manager.markListened("br_new_stale"); // stale: 2d ago (newer-listened)

    vi.setSystemTime(NOW - 5 * DAY);
    await manager.store("br_recent", makeBlob(25));
    vi.setSystemTime(NOW - 1 * HOUR);
    await manager.markListened("br_recent"); // not stale (1h ago)

    vi.setSystemTime(NOW - 4 * DAY);
    await manager.store("br_unlistened", makeBlob(25));
    // total used = 100, budget = 100

    vi.setSystemTime(NOW);
    // Need 30 free; phase 1 evicts oldest-listenedAt first: br_old_stale (25), still short → br_new_stale (25). 50 freed ≥ 30.
    await manager.store("br_new", makeBlob(30));

    expect(await manager.has("br_old_stale")).toBe(false);
    expect(await manager.has("br_new_stale")).toBe(false);
    expect(await manager.has("br_recent")).toBe(true);
    expect(await manager.has("br_unlistened")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("evicts unlistened entries oldest-cached first when no listened-stale exist", async () => {
    vi.setSystemTime(NOW - 5 * DAY);
    await manager.store("br_oldest", makeBlob(40));
    vi.setSystemTime(NOW - 3 * DAY);
    await manager.store("br_middle", makeBlob(40));
    vi.setSystemTime(NOW - 1 * DAY);
    await manager.store("br_newest", makeBlob(20));

    vi.setSystemTime(NOW);
    // Need 30 free; phase 2 evicts oldest-cached: br_oldest (40 freed) → done.
    await manager.store("br_new", makeBlob(30));

    expect(await manager.has("br_oldest")).toBe(false);
    expect(await manager.has("br_middle")).toBe(true);
    expect(await manager.has("br_newest")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("falls back to recently-listened only when stale and unlistened can't free enough", async () => {
    vi.setSystemTime(NOW - 5 * HOUR);
    await manager.store("br_a", makeBlob(50));
    await manager.markListened("br_a"); // 5h ago
    vi.setSystemTime(NOW - 2 * HOUR);
    await manager.store("br_b", makeBlob(50));
    await manager.markListened("br_b"); // 2h ago

    vi.setSystemTime(NOW);
    // No stale, no unlistened. Phase 3 evicts recent-listened oldest-listenedAt first: br_a.
    await manager.store("br_new", makeBlob(30));

    expect(await manager.has("br_a")).toBe(false);
    expect(await manager.has("br_b")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("evicts stale-listened before unlistened even when unlistened is older-cached", async () => {
    // br_unlistened cached LONG ago, never listened. br_stale cached recently, listened >24h ago.
    // Phase 1 must run first regardless of cachedAt order.
    vi.setSystemTime(NOW - 10 * DAY);
    await manager.store("br_unlistened", makeBlob(50));
    vi.setSystemTime(NOW - 1 * DAY);
    await manager.store("br_stale", makeBlob(50));
    vi.setSystemTime(NOW - 25 * HOUR);
    await manager.markListened("br_stale"); // just over 24h

    vi.setSystemTime(NOW);
    await manager.store("br_new", makeBlob(30));

    expect(await manager.has("br_stale")).toBe(false);
    expect(await manager.has("br_unlistened")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("never evicts the currently-playing entry, even when it's the prime eviction target", async () => {
    vi.setSystemTime(NOW - 5 * DAY);
    await manager.store("br_playing", makeBlob(40));
    vi.setSystemTime(NOW - 3 * DAY);
    await manager.markListened("br_playing"); // would be the only stale-listened candidate
    vi.setSystemTime(NOW - 4 * DAY);
    await manager.store("br_other", makeBlob(60));

    manager.setCurrentlyPlaying("br_playing");

    vi.setSystemTime(NOW);
    // Phase 1 candidate (br_playing) is blocked → falls through to phase 2: br_other (60 freed) → done.
    await manager.store("br_new", makeBlob(30));

    expect(await manager.has("br_playing")).toBe(true);
    expect(await manager.has("br_other")).toBe(false);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("does not evict when there is already enough room", async () => {
    await manager.store("br_keep", makeBlob(40)); // usage=40, budget=100
    await manager.store("br_new", makeBlob(30)); // available=60 ≥ 30, no eviction

    expect(await manager.has("br_keep")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });

  it("stops evicting once enough space is freed (no over-eviction)", async () => {
    // Four stale entries; new blob only needs to evict one.
    vi.setSystemTime(NOW - 7 * DAY);
    await manager.store("br_1", makeBlob(25));
    vi.setSystemTime(NOW - 4 * DAY);
    await manager.markListened("br_1");

    vi.setSystemTime(NOW - 6 * DAY);
    await manager.store("br_2", makeBlob(25));
    vi.setSystemTime(NOW - 3 * DAY);
    await manager.markListened("br_2");

    vi.setSystemTime(NOW - 5 * DAY);
    await manager.store("br_3", makeBlob(25));
    vi.setSystemTime(NOW - 2 * DAY);
    await manager.markListened("br_3");

    vi.setSystemTime(NOW - 4 * DAY);
    await manager.store("br_4", makeBlob(25));

    vi.setSystemTime(NOW);
    // Need 20 free; oldest-listenedAt is br_1 (4d ago). Frees 25 ≥ 20 → stop.
    await manager.store("br_new", makeBlob(20));

    expect(await manager.has("br_1")).toBe(false);
    expect(await manager.has("br_2")).toBe(true);
    expect(await manager.has("br_3")).toBe(true);
    expect(await manager.has("br_4")).toBe(true);
    expect(await manager.has("br_new")).toBe(true);
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
