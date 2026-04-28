import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiProviderError } from "../ai-errors";

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const { getLlmProviderImpl, LLM_TIMEOUT_MS } = await import("../llm-providers");

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

describe("LLM Providers - timeout wiring", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("LLM_TIMEOUT_MS is 5 minutes (under STALE_LOCK_MS = 10min)", () => {
    expect(LLM_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  it("Anthropic passes an AbortSignal to messages.create as RequestOptions", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-3-haiku",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = getLlmProviderImpl("anthropic");
    await provider.complete([{ role: "user", content: "hi" }], "claude-3-haiku", 100, { ANTHROPIC_API_KEY: "k" } as any);

    const requestOptions = mockCreate.mock.calls[0][1];
    expect(requestOptions?.signal).toBeInstanceOf(AbortSignal);
  });

  it("Groq passes an AbortSignal to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          model: "llama-3",
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 }
      )
    );

    const provider = getLlmProviderImpl("groq");
    await provider.complete([{ role: "user", content: "hi" }], "llama-3", 100, { GROQ_API_KEY: "k" } as any);

    const init = fetchSpy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    fetchSpy.mockRestore();
  });

  it("Cloudflare AI.run rejects with timeout error when call exceeds LLM_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    try {
      // AI.run returns a promise that never resolves
      const env = { AI: { run: vi.fn(() => new Promise(() => {})) } } as any;
      const provider = getLlmProviderImpl("cloudflare");

      const promise = provider.complete([{ role: "user", content: "hi" }], "@cf/meta/llama-3", 100, env);
      // Swallow unhandled rejection during the advance
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS + 100);

      await expect(promise).rejects.toThrow(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });
});
