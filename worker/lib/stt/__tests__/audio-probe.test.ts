import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectAudioFormat, extFromContentType, probeAudio, transcribeChunked } from "../audio-probe";

// ---------------------------------------------------------------------------
// detectAudioFormat (moved from transcription.test.ts)
// ---------------------------------------------------------------------------

describe("detectAudioFormat", () => {
  function makeBuffer(...bytes: number[]): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) view[i] = bytes[i];
    return buf;
  }

  it("MP3 with ID3v2 header", () => {
    const result = detectAudioFormat(makeBuffer(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "mp3", details: "ID3v2.4" });
  });

  it("MP3 raw MPEG1 Layer3", () => {
    const result = detectAudioFormat(makeBuffer(0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "mp3", details: "MPEG1 Layer3" });
  });

  it("WAV RIFF header", () => {
    const result = detectAudioFormat(makeBuffer(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "wav", details: "RIFF" });
  });

  it("FLAC header", () => {
    const result = detectAudioFormat(makeBuffer(0x66, 0x4C, 0x61, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "flac" });
  });

  it("OGG header", () => {
    const result = detectAudioFormat(makeBuffer(0x4F, 0x67, 0x67, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "ogg" });
  });

  it("M4A ftyp box", () => {
    const result = detectAudioFormat(makeBuffer(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20));
    expect(result).toEqual({ format: "m4a", details: "ftyp" });
  });

  it("unknown bytes", () => {
    const result = detectAudioFormat(makeBuffer(0xAA, 0xBB, 0xCC, 0xDD, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "unknown", details: "magic: aa bb cc dd" });
  });

  it("buffer < 4 bytes returns unknown too small", () => {
    const result = detectAudioFormat(makeBuffer(0xFF, 0xFB));
    expect(result).toEqual({ format: "unknown", details: "too small" });
  });
});

// ---------------------------------------------------------------------------
// extFromContentType
// ---------------------------------------------------------------------------

describe("extFromContentType", () => {
  it("resolves audio/mpeg to mp3", () => {
    expect(extFromContentType("audio/mpeg", "https://example.com/audio.mp3")).toBe("mp3");
  });

  it("resolves audio/mp4 to m4a", () => {
    expect(extFromContentType("audio/mp4", "https://example.com/audio.m4a")).toBe("m4a");
  });

  it("falls back to URL extension", () => {
    expect(extFromContentType("application/octet-stream", "https://example.com/audio.ogg")).toBe("ogg");
  });

  it("defaults to mp3 when nothing matches", () => {
    expect(extFromContentType(null, "https://example.com/audio")).toBe("mp3");
  });

  it("handles content-type with charset", () => {
    expect(extFromContentType("audio/flac; charset=utf-8", "https://example.com/audio")).toBe("flac");
  });
});

// ---------------------------------------------------------------------------
// probeAudio
// ---------------------------------------------------------------------------

describe("probeAudio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mp3MagicBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  function mockFetchForProbe(opts: {
    contentLength?: number | null;
    contentType?: string;
    acceptRanges?: string;
    rangeStatus?: number;
    magicBytes?: Uint8Array;
  } = {}) {
    const {
      contentLength = 50_000_000,
      contentType = "audio/mpeg",
      acceptRanges = "bytes",
      rangeStatus = 206,
      magicBytes = mp3MagicBytes,
    } = opts;

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        const headers = new Headers();
        if (contentType) headers.set("content-type", contentType);
        if (contentLength != null) headers.set("content-length", String(contentLength));
        if (acceptRanges) headers.set("accept-ranges", acceptRanges);
        return Promise.resolve({ ok: true, status: 200, headers });
      }
      // Range request for magic bytes
      return Promise.resolve({
        ok: rangeStatus === 200,
        status: rangeStatus,
        headers: new Headers({ "content-type": "audio/mpeg" }),
        arrayBuffer: () => Promise.resolve(magicBytes.buffer),
      });
    }));
  }

  it("returns full probe with HEAD + range request", async () => {
    mockFetchForProbe();
    const probe = await probeAudio("https://example.com/audio.mp3", 3600);

    expect(probe.contentLength).toBe(50_000_000);
    expect(probe.contentType).toBe("audio/mpeg");
    expect(probe.ext).toBe("mp3");
    expect(probe.detectedFormat.format).toBe("mp3");
    expect(probe.durationEstimateSeconds).toBe(3600); // episode duration used
    expect(probe.supportsRangeRequests).toBe(true);
  });

  it("uses bitrate estimate when no episode duration", async () => {
    mockFetchForProbe({ contentLength: 16_000_000 });
    const probe = await probeAudio("https://example.com/audio.mp3", null);

    // 16MB / (128kbps / 8) = 1000 seconds
    expect(probe.durationEstimateSeconds).toBe(1000);
  });

  it("handles missing Content-Length", async () => {
    mockFetchForProbe({ contentLength: null });
    const probe = await probeAudio("https://example.com/audio.mp3", 600);

    expect(probe.contentLength).toBeNull();
    expect(probe.durationEstimateSeconds).toBe(600);
  });

  it("detects no range support", async () => {
    mockFetchForProbe({ acceptRanges: "" });
    const probe = await probeAudio("https://example.com/audio.mp3", null);

    expect(probe.supportsRangeRequests).toBe(false);
  });

  it("handles failed range request gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        const headers = new Headers({ "content-type": "audio/mpeg", "content-length": "1000000" });
        return Promise.resolve({ ok: true, status: 200, headers });
      }
      // Range request fails
      return Promise.reject(new Error("Network error"));
    }));

    const probe = await probeAudio("https://example.com/audio.mp3", null);
    expect(probe.detectedFormat.format).toBe("unknown");
    expect(probe.contentLength).toBe(1000000);
  });
});

// ---------------------------------------------------------------------------
// transcribeChunked
// ---------------------------------------------------------------------------

describe("transcribeChunked", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockProvider(transcripts: string[]) {
    let callIndex = 0;
    return {
      name: "MockProvider",
      provider: "mock",
      supportsUrl: false,
      transcribe: vi.fn().mockImplementation(() => {
        const transcript = transcripts[callIndex++] || "";
        return Promise.resolve({ transcript, costDollars: null, latencyMs: 10 });
      }),
    };
  }

  function mockFetchForChunks(totalBytes: number) {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const rangeHeader = (init?.headers as Record<string, string>)?.Range;
      const match = rangeHeader?.match(/bytes=(\d+)-(\d+)/);
      const start = match ? Number(match[1]) : 0;
      const end = match ? Number(match[2]) : totalBytes - 1;
      const chunkSize = end - start + 1;
      return Promise.resolve({
        ok: true,
        status: 206,
        headers: new Headers({ "content-type": "audio/mpeg" }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(chunkSize)),
      });
    }));
  }

  it("concatenates transcripts from multiple chunks", async () => {
    const totalBytes = 60_000_000; // 60MB
    const chunkSize = 25_000_000; // 25MB → 3 chunks
    mockFetchForChunks(totalBytes);
    const provider = createMockProvider(["Hello", "world", "!"]);

    const result = await transcribeChunked(
      "https://example.com/audio.mp3", totalBytes, chunkSize, "mp3",
      provider as any, 3600, {} as any, "whisper-1",
    );

    expect(result.transcript).toBe("Hello world !");
    expect(provider.transcribe).toHaveBeenCalledTimes(3);
  });

  it("sends correct Range headers", async () => {
    const totalBytes = 50_000_000;
    const chunkSize = 25_000_000;
    mockFetchForChunks(totalBytes);
    const provider = createMockProvider(["A", "B"]);

    await transcribeChunked(
      "https://example.com/audio.mp3", totalBytes, chunkSize, "mp3",
      provider as any, 3600, {} as any, "whisper-1",
    );

    const fetchCalls = (fetch as any).mock.calls;
    expect(fetchCalls[0][1].headers.Range).toBe("bytes=0-24999999");
    expect(fetchCalls[1][1].headers.Range).toBe("bytes=25000000-49999999");
  });

  it("handles single chunk (file smaller than chunk size)", async () => {
    const totalBytes = 10_000_000;
    const chunkSize = 25_000_000;
    mockFetchForChunks(totalBytes);
    const provider = createMockProvider(["Single chunk transcript"]);

    const result = await transcribeChunked(
      "https://example.com/audio.mp3", totalBytes, chunkSize, "mp3",
      provider as any, 600, {} as any, "whisper-1",
    );

    expect(result.transcript).toBe("Single chunk transcript");
    expect(provider.transcribe).toHaveBeenCalledTimes(1);
  });

  it("propagates provider errors", async () => {
    const totalBytes = 50_000_000;
    const chunkSize = 25_000_000;
    mockFetchForChunks(totalBytes);
    const provider = {
      name: "MockProvider",
      provider: "mock",
      supportsUrl: false,
      transcribe: vi.fn()
        .mockResolvedValueOnce({ transcript: "OK", costDollars: null, latencyMs: 10 })
        .mockRejectedValueOnce(new Error("Provider exploded")),
    };

    await expect(transcribeChunked(
      "https://example.com/audio.mp3", totalBytes, chunkSize, "mp3",
      provider as any, 3600, {} as any, "whisper-1",
    )).rejects.toThrow("Provider exploded");
  });
});
