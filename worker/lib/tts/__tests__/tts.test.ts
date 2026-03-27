import { describe, it, expect, vi } from "vitest";
import { generateSpeech, DEFAULT_VOICE, DEFAULT_INSTRUCTIONS } from "../tts";
import type { TtsProvider, TtsResult } from "../providers";

function createMockTtsProvider(audioBuffer: ArrayBuffer): TtsProvider {
  return {
    name: "MockTTS",
    provider: "mock",
    synthesize: vi.fn().mockResolvedValue({
      audio: audioBuffer,
    } satisfies TtsResult),
  };
}

const mockEnv = {} as any;
const mockPricing = {
  pricePerKChars: 12,
};

describe("generateSpeech", () => {
  const fakeAudio = new ArrayBuffer(1024);

  it("should return an ArrayBuffer of audio data with usage", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    const result = await generateSpeech(tts, "Hello world", DEFAULT_VOICE, "mock-tts-model", mockEnv, mockPricing);

    expect(result.audio).toBeInstanceOf(ArrayBuffer);
    expect(result.audio.byteLength).toBe(1024);
    expect(result.usage.model).toBe("mock-tts-model");
    expect(result.usage.inputTokens).toBe("Hello world".length);
    expect(result.usage.outputTokens).toBe(0);
  });

  it("should pass providerModelId to the TTS provider", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    await generateSpeech(tts, "Hello world", DEFAULT_VOICE, "custom-tts-model", mockEnv);

    const call = (tts.synthesize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toBe("custom-tts-model");
  });

  it("should use default voice when none specified", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    await generateSpeech(tts, "Hello world", undefined as any, "mock-tts-model", mockEnv);

    const call = (tts.synthesize as ReturnType<typeof vi.fn>).mock.calls[0];
    // Default parameter kicks in — voice becomes DEFAULT_VOICE
    expect(call[1]).toBe(DEFAULT_VOICE);
  });

  it("should use custom voice when specified", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    await generateSpeech(tts, "Hello world", "alloy", "mock-tts-model", mockEnv);

    const call = (tts.synthesize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("alloy");
  });

  it("should pass the input text to the provider", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    await generateSpeech(tts, "Specific text for TTS", DEFAULT_VOICE, "mock-tts-model", mockEnv);

    const call = (tts.synthesize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("Specific text for TTS");
  });

  it("should pass speaking instructions to the provider", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    await generateSpeech(tts, "text", DEFAULT_VOICE, "mock-tts-model", mockEnv);

    const call = (tts.synthesize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3]).toBe(DEFAULT_INSTRUCTIONS);
  });

  it("should return null cost when no pricing provided", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    const result = await generateSpeech(tts, "Hello world", DEFAULT_VOICE, "mock-tts-model", mockEnv);
    expect(result.usage.cost).toBeNull();
  });

  it("should calculate per-char cost when pricing available", async () => {
    const tts = createMockTtsProvider(fakeAudio);
    const text = "Hello world";
    const result = await generateSpeech(tts, text, DEFAULT_VOICE, "mock-tts-model", mockEnv, mockPricing);
    // calculateCharCost: (charCount / 1000) * pricePerKChars
    const expected = (text.length / 1000) * 12;
    expect(result.usage.cost).toBe(expected);
  });
});
