import { describe, it, expect, vi } from "vitest";
import { assembleBriefingAudio } from "../assembly";

function makeMp3Buffer(id: number, size = 100): ArrayBuffer {
  const buf = new Uint8Array(size);
  buf[0] = 0xff;
  buf[1] = 0xfb;
  buf[2] = id;
  return buf.buffer;
}

function createMockR2(intro: ArrayBuffer | null, outro: ArrayBuffer | null) {
  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.includes("intro") && intro) {
        return { arrayBuffer: () => Promise.resolve(intro) };
      }
      if (key.includes("outro") && outro) {
        return { arrayBuffer: () => Promise.resolve(outro) };
      }
      return null;
    }),
    put: vi.fn(),
  } as unknown as R2Bucket;
}

describe("assembleBriefingAudio", () => {
  const clipAudio = makeMp3Buffer(0x01, 1000);

  it("concatenates intro + clip + outro when both jingles present", async () => {
    const intro = makeMp3Buffer(0x10, 200);
    const outro = makeMp3Buffer(0x20, 200);
    const r2 = createMockR2(intro, outro);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(clipAudio.byteLength);
  });

  it("concatenates intro + clip when only intro is present", async () => {
    const intro = makeMp3Buffer(0x10, 200);
    const r2 = createMockR2(intro, null);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(clipAudio.byteLength);
  });

  it("concatenates clip + outro when only outro is present", async () => {
    const outro = makeMp3Buffer(0x20, 200);
    const r2 = createMockR2(null, outro);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
  });

  it("returns raw clip without concat when no jingles uploaded", async () => {
    const r2 = createMockR2(null, null);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(false);
    expect(result.isFallback).toBe(false);
    expect(result.audio).toBe(clipAudio);
    expect(result.sizeBytes).toBe(clipAudio.byteLength);
  });

  it("falls back to raw clip when R2.get throws", async () => {
    const r2 = {
      get: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    } as unknown as R2Bucket;
    const mockLog = { warn: vi.fn() };

    const result = await assembleBriefingAudio(clipAudio, r2, mockLog);

    expect(result.isFallback).toBe(true);
    expect(result.hasJingles).toBe(false);
    expect(result.audio).toBe(clipAudio);
    expect(mockLog.warn).toHaveBeenCalledWith("assembly_fallback", {
      error: "R2 unavailable",
    });
  });

  it("falls back to raw clip when arrayBuffer() throws", async () => {
    const r2 = {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.reject(new Error("corrupt")),
      }),
    } as unknown as R2Bucket;
    const mockLog = { warn: vi.fn() };

    const result = await assembleBriefingAudio(clipAudio, r2, mockLog);

    expect(result.isFallback).toBe(true);
    expect(result.audio).toBe(clipAudio);
  });

  it("output starts with intro bytes when intro is present", async () => {
    const introBytes = new Uint8Array([0xff, 0xfb, 0xaa, 0xbb]);
    const r2 = createMockR2(introBytes.buffer, null);

    const result = await assembleBriefingAudio(clipAudio, r2);
    const output = new Uint8Array(result.audio);

    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xfb);
  });
});
