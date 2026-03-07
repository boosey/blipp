import { describe, it, expect, vi } from "vitest";
import { generateSpeech, DEFAULT_VOICE, TTS_MODEL } from "../tts";

function createMockOpenAIClient(audioBuffer: ArrayBuffer) {
  return {
    audio: {
      speech: {
        create: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(audioBuffer),
        }),
      },
    },
  } as any;
}

describe("generateSpeech", () => {
  const fakeAudio = new ArrayBuffer(1024);

  it("should return an ArrayBuffer of audio data", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    const result = await generateSpeech(client, "Hello world");

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(1024);
  });

  it("should use default TTS model when none specified", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "Hello world");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.model).toBe(TTS_MODEL);
    expect(call.response_format).toBe("mp3");
  });

  it("should use custom model when specified", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "Hello world", DEFAULT_VOICE, "tts-1-hd");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.model).toBe("tts-1-hd");
  });

  it("should use default voice when none specified", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "Hello world");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.voice).toBe(DEFAULT_VOICE);
  });

  it("should use custom voice when specified", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "Hello world", "alloy");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.voice).toBe("alloy");
  });

  it("should pass the input text to OpenAI", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "Specific text for TTS");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.input).toBe("Specific text for TTS");
  });

  it("should include speaking instructions", async () => {
    const client = createMockOpenAIClient(fakeAudio);
    await generateSpeech(client, "text");

    const call = client.audio.speech.create.mock.calls[0][0];
    expect(call.instructions).toContain("warm, professional tone");
  });
});
