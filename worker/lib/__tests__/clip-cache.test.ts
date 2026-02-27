import { describe, it, expect, vi } from "vitest";
import {
  clipKey,
  briefingKey,
  getClip,
  putClip,
  putBriefing,
} from "../clip-cache";

describe("clipKey", () => {
  it("should generate correct R2 key format", () => {
    expect(clipKey("ep-123", 5)).toBe("clips/ep-123/5.mp3");
  });

  it("should handle different duration tiers", () => {
    expect(clipKey("ep-1", 1)).toBe("clips/ep-1/1.mp3");
    expect(clipKey("ep-1", 15)).toBe("clips/ep-1/15.mp3");
  });
});

describe("briefingKey", () => {
  it("should generate correct R2 key format", () => {
    expect(briefingKey("user-1", "2026-02-26")).toBe(
      "briefings/user-1/2026-02-26.mp3"
    );
  });
});

describe("getClip", () => {
  it("should return ArrayBuffer when clip exists", async () => {
    const audioData = new ArrayBuffer(512);
    const mockR2 = {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(audioData),
      }),
    } as unknown as R2Bucket;

    const result = await getClip(mockR2, "ep-1", 5);

    expect(result).toBe(audioData);
    expect(mockR2.get).toHaveBeenCalledWith("clips/ep-1/5.mp3");
  });

  it("should return null when clip does not exist", async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    const result = await getClip(mockR2, "ep-1", 5);
    expect(result).toBeNull();
  });

  it("should use correct key for different tiers", async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    await getClip(mockR2, "ep-abc", 10);
    expect(mockR2.get).toHaveBeenCalledWith("clips/ep-abc/10.mp3");
  });
});

describe("putClip", () => {
  it("should store audio in R2 with correct key", async () => {
    const mockR2 = {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket;
    const audio = new ArrayBuffer(256);

    await putClip(mockR2, "ep-1", 3, audio);

    expect(mockR2.put).toHaveBeenCalledWith("clips/ep-1/3.mp3", audio);
  });
});

describe("putBriefing", () => {
  it("should store briefing and return the key", async () => {
    const mockR2 = {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket;
    const audio = new ArrayBuffer(1024);

    const key = await putBriefing(mockR2, "user-1", "2026-02-26", audio);

    expect(key).toBe("briefings/user-1/2026-02-26.mp3");
    expect(mockR2.put).toHaveBeenCalledWith(
      "briefings/user-1/2026-02-26.mp3",
      audio
    );
  });
});
