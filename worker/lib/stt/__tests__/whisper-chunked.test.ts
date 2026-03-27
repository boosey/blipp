import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAudioMetadata,
  transcribeChunked,
  WHISPER_MAX_BYTES,
  CHUNK_SIZE,
} from "../whisper-chunked";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("constants", () => {
  it("WHISPER_MAX_BYTES is 25MB", () => {
    expect(WHISPER_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it("CHUNK_SIZE is 20MB", () => {
    expect(CHUNK_SIZE).toBe(20 * 1024 * 1024);
  });
});

describe("getAudioMetadata", () => {
  it("returns content length and type from HEAD request", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Map([
        ["content-length", "52428800"],
        ["content-type", "audio/mpeg"],
      ]),
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: 52428800, contentType: "audio/mpeg" });
    expect(fetch).toHaveBeenCalledWith("https://example.com/audio.mp3", { method: "HEAD" });
  });

  it("returns null contentLength when header is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Map([["content-type", "audio/mpeg"]]),
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: null, contentType: "audio/mpeg" });
  });

  it("returns null contentType when header is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: (key: string) => key === "content-length" ? "1000" : null },
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: 1000, contentType: null });
  });
});

describe("transcribeChunked", () => {
  const mockOpenai = {
    audio: {
      transcriptions: {
        create: vi.fn(),
      },
    },
  } as any;

  // Stub File if not available in test env
  beforeEach(() => {
    if (typeof globalThis.File === "undefined") {
      globalThis.File = class File extends Blob {
        name: string;
        lastModified: number;
        constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(parts, opts);
          this.name = name;
          this.lastModified = Date.now();
        }
      } as any;
    }
  });

  it("transcribes multiple chunks and concatenates text", async () => {
    const totalSize = 45 * 1024 * 1024; // 45MB = 3 chunks at 20MB each

    // Mock Range requests returning blobs
    (fetch as any).mockImplementation((_url: string, opts: any) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({
          ok: true,
          headers: new Map([
            ["content-length", String(totalSize)],
            ["content-type", "audio/mpeg"],
          ]),
        });
      }
      // Range request
      return Promise.resolve({
        ok: true,
        status: 206,
        blob: () => Promise.resolve(new Blob(["audio-chunk"])),
      });
    });

    mockOpenai.audio.transcriptions.create
      .mockResolvedValueOnce({ text: "Chunk one." })
      .mockResolvedValueOnce({ text: "Chunk two." })
      .mockResolvedValueOnce({ text: "Chunk three." });

    const pricing = { pricePerMinute: 0.006 };
    const result = await transcribeChunked(
      mockOpenai,
      "https://example.com/audio.mp3",
      totalSize,
      "whisper-large-v3-turbo",
      pricing
    );
    expect(result.transcript).toBe("Chunk one. Chunk two. Chunk three.");
    const expectedTokens = Math.round(totalSize / 16000);
    const estimatedSeconds = totalSize / (128 * 1000 / 8);
    expect(result.usage).toEqual({
      model: "whisper-large-v3-turbo",
      inputTokens: expectedTokens,
      outputTokens: 0,
      cost: (estimatedSeconds / 60) * 0.006,
      audioSeconds: estimatedSeconds,
    });
    expect(mockOpenai.audio.transcriptions.create).toHaveBeenCalledTimes(3);
  });

  it("passes correct Range headers for each chunk", async () => {
    const totalSize = CHUNK_SIZE * 2 + 1000; // 2 full chunks + small remainder

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 206,
      blob: () => Promise.resolve(new Blob(["audio"])),
    });

    mockOpenai.audio.transcriptions.create.mockResolvedValue({ text: "text" });

    await transcribeChunked(mockOpenai, "https://example.com/a.mp3", totalSize, "whisper-large-v3-turbo");

    // First chunk: bytes=0-20971519
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=0-${CHUNK_SIZE - 1}` },
    });
    // Second chunk
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=${CHUNK_SIZE}-${CHUNK_SIZE * 2 - 1}` },
    });
    // Third chunk (remainder)
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=${CHUNK_SIZE * 2}-${totalSize - 1}` },
    });
  });

  it("uses the provided model for each chunk", async () => {
    const totalSize = CHUNK_SIZE + 1000;

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 206,
      blob: () => Promise.resolve(new Blob(["audio"])),
    });

    mockOpenai.audio.transcriptions.create.mockResolvedValue({ text: "text" });

    await transcribeChunked(mockOpenai, "https://example.com/a.mp3", totalSize, "whisper-large-v3-turbo");

    for (const call of mockOpenai.audio.transcriptions.create.mock.calls) {
      expect(call[0].model).toBe("whisper-large-v3-turbo");
    }
  });
});
