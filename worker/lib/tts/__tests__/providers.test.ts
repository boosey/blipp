import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiProviderError } from "../../ai-errors";

// Mock OpenAI SDK
const mockSpeechCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    audio = { speech: { create: mockSpeechCreate } };
  },
}));

const { getTtsProviderImpl } = await import("../providers");

describe("TTS Providers - AiProviderError wrapping", () => {
  beforeEach(() => {
    mockSpeechCreate.mockReset();
  });

  it("OpenAI throws AiProviderError on SDK error", async () => {
    const sdkError = new Error("quota exceeded");
    (sdkError as any).status = 429;
    mockSpeechCreate.mockRejectedValueOnce(sdkError);

    const provider = getTtsProviderImpl("openai");
    const env = { OPENAI_API_KEY: "test" } as any;

    await expect(
      provider.synthesize("hello", "alloy", "tts-1", undefined, env)
    ).rejects.toThrow(AiProviderError);
  });

  it("Groq throws AiProviderError on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("server error", { status: 500 })
    );

    const provider = getTtsProviderImpl("groq");
    const env = { GROQ_API_KEY: "test" } as any;

    await expect(
      provider.synthesize("hello", "austin", "orpheus-v1", undefined, env)
    ).rejects.toThrow(AiProviderError);

    vi.restoreAllMocks();
  });

  it("Cloudflare throws AiProviderError when AI.run fails", async () => {
    const env = { AI: { run: vi.fn().mockRejectedValue(new Error("model unavailable")) } } as any;

    const provider = getTtsProviderImpl("cloudflare");

    await expect(
      provider.synthesize("hello", "default", "@cf/tts-model", undefined, env)
    ).rejects.toThrow(AiProviderError);
  });
});
