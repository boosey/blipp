import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock provider implementations
vi.mock("../llm-providers", () => ({
  getLlmProviderImpl: vi.fn(),
}));
vi.mock("../stt/providers", () => ({
  getProviderImpl: vi.fn(),
}));
vi.mock("../tts/providers", () => ({
  getTtsProviderImpl: vi.fn(),
}));

import { runSmokeTest } from "../smoke-test";
import { getLlmProviderImpl } from "../llm-providers";
import { getProviderImpl } from "../stt/providers";
import { getTtsProviderImpl } from "../tts/providers";

const mockEnv = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runSmokeTest", () => {
  it("succeeds for LLM stage (distillation)", async () => {
    const mockComplete = vi.fn().mockResolvedValue({ model: "test", inputTokens: 5, outputTokens: 3 });
    vi.mocked(getLlmProviderImpl).mockReturnValue({ name: "test", provider: "anthropic", complete: mockComplete });

    const result = await runSmokeTest("distillation", "anthropic", "claude-test", mockEnv);

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockComplete).toHaveBeenCalledWith(
      [{ role: "user", content: "Say hello." }],
      "claude-test",
      10,
      mockEnv
    );
  });

  it("succeeds for STT stage", async () => {
    const mockTranscribe = vi.fn().mockResolvedValue({ text: "", segments: [] });
    vi.mocked(getProviderImpl).mockReturnValue({
      name: "test", provider: "openai", supportsUrl: false, transcribe: mockTranscribe,
    });

    const result = await runSmokeTest("stt", "openai", "whisper-1", mockEnv);

    expect(result.success).toBe(true);
    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(ArrayBuffer), filename: "smoke-test.wav" }),
      1,
      mockEnv,
      "whisper-1"
    );
  });

  it("succeeds for TTS stage", async () => {
    const mockSynthesize = vi.fn().mockResolvedValue({ audio: new ArrayBuffer(100), contentType: "audio/mpeg" });
    vi.mocked(getTtsProviderImpl).mockReturnValue({ name: "test", provider: "openai", synthesize: mockSynthesize });

    const result = await runSmokeTest("tts", "openai", "tts-1", mockEnv);

    expect(result.success).toBe(true);
    expect(mockSynthesize).toHaveBeenCalledWith("Hello.", "coral", "tts-1", undefined, mockEnv);
  });

  it("returns failure with actionable error on 401", async () => {
    vi.mocked(getLlmProviderImpl).mockReturnValue({
      name: "test", provider: "anthropic",
      complete: vi.fn().mockRejectedValue(new Error("Request failed with status 401")),
    });

    const result = await runSmokeTest("narrative", "anthropic", "claude-test", mockEnv);

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
    expect(result.error).toContain("check API key");
  });

  it("returns failure for unknown stage", async () => {
    const result = await runSmokeTest("unknown", "openai", "model-x", mockEnv);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown stage");
  });

  it("returns failure when provider throws generic error", async () => {
    vi.mocked(getTtsProviderImpl).mockReturnValue({
      name: "test", provider: "openai",
      synthesize: vi.fn().mockRejectedValue(new Error("Connection timeout")),
    });

    const result = await runSmokeTest("tts", "openai", "tts-1", mockEnv);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection timeout");
  });
});
