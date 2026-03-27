import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEnv } from "../../../tests/helpers/mocks";
import { getProviderImpl } from "../stt-providers";
import { AiProviderError } from "../ai-errors";
import type { Env } from "../../types";

describe("stt-providers", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // CloudflareWhisperProvider (provider: "cloudflare")
  // -------------------------------------------------------------------------
  describe("CloudflareWhisperProvider", () => {
    const provider = getProviderImpl("cloudflare");

    it("has correct metadata", () => {
      expect(provider.name).toBe("Cloudflare Whisper");
      expect(provider.provider).toBe("cloudflare");
      expect(provider.supportsUrl).toBe(false);
    });

    it("transcribes audio via env.AI.run with base64-encoded audio", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "hello world" });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(1);
      const [model, payload] = (env.AI.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(model).toBe("@cf/openai/whisper");
      // Audio should be base64 string
      expect(typeof payload.audio).toBe("string");
      expect(result.transcript).toBe("hello world");
      expect(result.costDollars).toBeNull();
      expect(typeof result.latencyMs).toBe("number");
    });

    it("handles chunked transcription for audio > 5MB", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ text: "chunk one" })
        .mockResolvedValueOnce({ text: "chunk two" });

      // Create buffer slightly over 5MB to trigger 2 chunks
      const buffer = new ArrayBuffer(5 * 1024 * 1024 + 100);
      const result = await provider.transcribe(
        { buffer, filename: "big.mp3" },
        300,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(2);
      expect(result.transcript).toBe("chunk one chunk two");
    });

    it("joins chunks with spaces", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ text: "  first  " })
        .mockResolvedValueOnce({ text: "  second  " })
        .mockResolvedValueOnce({ text: "  third  " });

      const buffer = new ArrayBuffer(5 * 1024 * 1024 * 2 + 100);
      const result = await provider.transcribe(
        { buffer, filename: "big.mp3" },
        600,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(3);
      expect(result.transcript).toBe("first second third");
    });

    it("retries once on transient error containing 1031", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("Worker error 1031: something went wrong"))
        .mockResolvedValueOnce({ text: "recovered" });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(2);
      expect(result.transcript).toBe("recovered");
    });

    it("retries once on transient error containing 504", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("504 gateway timeout"))
        .mockResolvedValueOnce({ text: "ok" });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(2);
      expect(result.transcript).toBe("ok");
    });

    it("retries once on transient error containing timeout", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("request timeout"))
        .mockResolvedValueOnce({ text: "ok" });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/openai/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(2);
      expect(result.transcript).toBe("ok");
    });

    it("throws AiProviderError on non-transient errors", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("model not found"),
      );

      const buffer = new ArrayBuffer(100);
      await expect(
        provider.transcribe({ buffer, filename: "test.mp3" }, 10, env, "@cf/openai/whisper"),
      ).rejects.toThrow(AiProviderError);
    });

    it("throws AiProviderError when retry also fails", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("1031 transient"))
        .mockRejectedValueOnce(new Error("1031 still broken"));

      const buffer = new ArrayBuffer(100);
      await expect(
        provider.transcribe({ buffer, filename: "test.mp3" }, 10, env, "@cf/openai/whisper"),
      ).rejects.toThrow(AiProviderError);

      expect(env.AI.run).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // CloudflareDeepgramProvider (provider: "cloudflare-deepgram")
  // -------------------------------------------------------------------------
  describe("CloudflareDeepgramProvider", () => {
    const provider = getProviderImpl("cloudflare-deepgram");

    it("has correct metadata", () => {
      expect(provider.name).toBe("Cloudflare Deepgram");
      expect(provider.provider).toBe("cloudflare-deepgram");
      expect(provider.supportsUrl).toBe(false);
    });

    it("transcribes audio via env.AI.run with ReadableStream", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        transcripts: [{ transcript: "deepgram result" }],
      });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/deepgram/whisper",
      );

      expect(env.AI.run).toHaveBeenCalledTimes(1);
      const [model, payload] = (env.AI.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(model).toBe("@cf/deepgram/whisper");
      expect(payload.audio.body).toBeInstanceOf(ReadableStream);
      expect(payload.audio.contentType).toBe("audio/mpeg");
      expect(payload.detect_language).toBe(true);
      expect(result.transcript).toBe("deepgram result");
    });

    it("handles response with transcripts array format", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        transcripts: [{ transcript: "from transcripts array" }],
      });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/deepgram/whisper",
      );

      expect(result.transcript).toBe("from transcripts array");
    });

    it("handles response with results.channels format", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: {
          channels: [{ alternatives: [{ transcript: "from channels" }] }],
        },
      });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/deepgram/whisper",
      );

      expect(result.transcript).toBe("from channels");
    });

    it("handles response with text format", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: "plain text response",
      });

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/deepgram/whisper",
      );

      expect(result.transcript).toBe("plain text response");
    });

    it("returns empty string when no transcript in response", async () => {
      (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const buffer = new ArrayBuffer(100);
      const result = await provider.transcribe(
        { buffer, filename: "test.mp3" },
        10,
        env,
        "@cf/deepgram/whisper",
      );

      expect(result.transcript).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Provider Registry
  // -------------------------------------------------------------------------
  describe("getProviderImpl", () => {
    it("returns correct provider for known names", () => {
      expect(getProviderImpl("cloudflare").provider).toBe("cloudflare");
      expect(getProviderImpl("cloudflare-deepgram").provider).toBe("cloudflare-deepgram");
      expect(getProviderImpl("openai").provider).toBe("openai");
      expect(getProviderImpl("deepgram").provider).toBe("deepgram");
      expect(getProviderImpl("groq").provider).toBe("groq");
    });

    it("throws for unknown provider names", () => {
      expect(() => getProviderImpl("unknown-provider")).toThrow(
        "No STT implementation for provider: unknown-provider",
      );
    });
  });
});
