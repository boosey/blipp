import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock Cache API
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
};
const mockCaches = {
  open: vi.fn().mockResolvedValue(mockCache),
};
vi.stubGlobal("caches", mockCaches);

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/fake-blob");
URL.createObjectURL = mockCreateObjectURL;

describe("jingle-cache", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply implementations cleared by clearAllMocks
    mockCaches.open.mockResolvedValue(mockCache);
    mockCache.match.mockResolvedValue(undefined);
    mockCache.put.mockResolvedValue(undefined);
    mockCreateObjectURL.mockReturnValue("blob:http://localhost/fake-blob");
    mockFetch.mockResolvedValue(new Response(new ArrayBuffer(100), { status: 200 }));

    // Re-import to reset module-level state
    vi.resetModules();
  });

  it("fetches and caches jingle on cache miss", async () => {
    mockCache.match.mockResolvedValue(undefined);

    const { getJingleUrl } = await import("../lib/jingle-cache");
    const url = await getJingleUrl("intro");

    expect(mockFetch).toHaveBeenCalledWith("/api/assets/jingles/intro.mp3");
    expect(mockCache.put).toHaveBeenCalled();
    expect(url).toBe("blob:http://localhost/fake-blob");
  });

  it("returns blob URL from cache hit without fetching", async () => {
    mockCache.match.mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(100), { status: 200 }))
    );

    const { getJingleUrl } = await import("../lib/jingle-cache");
    const url = await getJingleUrl("outro");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(url).toBe("blob:http://localhost/fake-blob");
  });

  it("returns null when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    const { getJingleUrl } = await import("../lib/jingle-cache");
    const url = await getJingleUrl("intro");

    expect(url).toBeNull();
  });

  it("returns null when fetch returns non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));

    const { getJingleUrl } = await import("../lib/jingle-cache");
    const url = await getJingleUrl("intro");

    expect(url).toBeNull();
  });

  it("returns null when Cache API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);

    const { getJingleUrl } = await import("../lib/jingle-cache");
    const url = await getJingleUrl("intro");

    expect(url).toBeNull();

    // Restore
    vi.stubGlobal("caches", mockCaches);
  });
});
