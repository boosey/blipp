import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
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

afterAll(() => {
  globalThis.fetch = originalFetch;
});
