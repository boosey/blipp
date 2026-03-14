import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiProviderError } from "../ai-errors";

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const { getLlmProviderImpl } = await import("../llm-providers");

describe("LLM Providers - AiProviderError wrapping", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("Anthropic throws AiProviderError on SDK error", async () => {
    const sdkError = new Error("rate limited");
    (sdkError as any).status = 429;
    mockCreate.mockRejectedValueOnce(sdkError);

    const provider = getLlmProviderImpl("anthropic");
    const env = { ANTHROPIC_API_KEY: "test" } as any;

    try {
      await provider.complete([{ role: "user", content: "hi" }], "claude-3-haiku", 100, env);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).provider).toBe("anthropic");
      expect((err as AiProviderError).httpStatus).toBe(429);
    }
  });

  it("Groq throws AiProviderError on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429, headers: { "x-ratelimit-remaining-tokens": "0" } })
    );

    const provider = getLlmProviderImpl("groq");
    const env = { GROQ_API_KEY: "test" } as any;

    await expect(
      provider.complete([{ role: "user", content: "hi" }], "llama-3", 100, env)
    ).rejects.toThrow(AiProviderError);

    vi.restoreAllMocks();
  });

  it("Cloudflare throws AiProviderError when AI.run fails", async () => {
    const env = { AI: { run: vi.fn().mockRejectedValue(new Error("model unavailable")) } } as any;

    const provider = getLlmProviderImpl("cloudflare");

    await expect(
      provider.complete([{ role: "user", content: "hi" }], "@cf/meta/llama-3-8b", 100, env)
    ).rejects.toThrow(AiProviderError);
  });
});
