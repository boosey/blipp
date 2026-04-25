import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeToMp3 } from "../audio-processing";

// Mock lamejs bundle
vi.mock("@/lib/lamejs-bundle", () => {
  class MockEncoder {
    encodeBuffer = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
    flush = vi.fn().mockReturnValue(new Uint8Array([4, 5]));
  }
  return { Mp3Encoder: MockEncoder };
});

describe("audio-processing", () => {
  describe("encodeToMp3", () => {
    it("should encode AudioBuffer to Mp3 Blob", async () => {
      const mockAudioBuffer = {
        sampleRate: 44100,
        length: 2304,
        getChannelData: vi.fn().mockReturnValue(new Float32Array(2304)),
      };

      const result = await encodeToMp3(mockAudioBuffer as any);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("audio/mpeg");
      expect(mockAudioBuffer.getChannelData).toHaveBeenCalledWith(0);
    });
  });
});
