import { describe, it, expect } from "vitest";
import { wpKey } from "../work-products";

describe("wpKey", () => {
  it("TRANSCRIPT returns correct R2 key", () => {
    expect(wpKey({ type: "TRANSCRIPT", episodeId: "ep-456" })).toBe(
      "wp/transcript/ep-456.txt"
    );
  });

  it("CLAIMS returns correct R2 key", () => {
    expect(wpKey({ type: "CLAIMS", episodeId: "ep-789" })).toBe(
      "wp/claims/ep-789.json"
    );
  });

  it("NARRATIVE returns correct R2 key with durationTier", () => {
    expect(wpKey({ type: "NARRATIVE", episodeId: "ep-123", durationTier: 5 })).toBe(
      "wp/narrative/ep-123/5.txt"
    );
  });

  it("AUDIO_CLIP returns correct R2 key with default voice", () => {
    expect(wpKey({ type: "AUDIO_CLIP", episodeId: "ep-123", durationTier: 3 })).toBe(
      "wp/clip/ep-123/3/default.mp3"
    );
  });

  it("AUDIO_CLIP returns correct R2 key with custom voice", () => {
    expect(wpKey({ type: "AUDIO_CLIP", episodeId: "ep-123", durationTier: 3, voice: "nova" })).toBe(
      "wp/clip/ep-123/3/nova.mp3"
    );
  });
});
