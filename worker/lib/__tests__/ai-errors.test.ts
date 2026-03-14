import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyAiError,
  extractHttpStatus,
  sanitizeResponse,
  writeAiError,
  AiProviderError,
  type AIServiceErrorData,
} from "../ai-errors";

describe("classifyAiError", () => {
  it("classifies 429 as rate_limit / transient", () => {
    const result = classifyAiError(new Error("rate limited"), 429);
    expect(result).toEqual({ category: "rate_limit", severity: "transient" });
  });

  it("classifies 504 as timeout / transient", () => {
    const result = classifyAiError(new Error("gateway timeout"), 504);
    expect(result).toEqual({ category: "timeout", severity: "transient" });
  });

  it("classifies 500 as server_error / transient", () => {
    const result = classifyAiError(new Error("internal error"), 500);
    expect(result).toEqual({ category: "server_error", severity: "transient" });
  });

  it("classifies 401 as auth / permanent", () => {
    const result = classifyAiError(new Error("unauthorized"), 401);
    expect(result).toEqual({ category: "auth", severity: "permanent" });
  });

  it("classifies 404 with 'does not exist' as model_not_found / permanent", () => {
    const result = classifyAiError(new Error("model does not exist"), 404);
    expect(result).toEqual({ category: "model_not_found", severity: "permanent" });
  });

  it("classifies content_policy as content_filter / permanent", () => {
    const result = classifyAiError(new Error("content_policy violation"));
    expect(result).toEqual({ category: "content_filter", severity: "permanent" });
  });

  it("classifies quota as quota_exceeded / permanent", () => {
    const result = classifyAiError(new Error("insufficient_quota"));
    expect(result).toEqual({ category: "quota_exceeded", severity: "permanent" });
  });

  it("classifies 400 as invalid_request / permanent", () => {
    const result = classifyAiError(new Error("bad request"), 400);
    expect(result).toEqual({ category: "invalid_request", severity: "permanent" });
  });

  it("classifies unknown error as unknown / transient", () => {
    const result = classifyAiError(new Error("something weird happened"));
    expect(result).toEqual({ category: "unknown", severity: "transient" });
  });

  it("extracts status from message string 'Groq API error 429: rate limit'", () => {
    const result = classifyAiError(new Error("Groq API error 429: rate limit"));
    expect(result.category).toBe("rate_limit");
  });

  it("classifies fetch failed as network / transient", () => {
    const result = classifyAiError(new Error("fetch failed"));
    expect(result).toEqual({ category: "network", severity: "transient" });
  });

  it("classifies message with 1031 as timeout / transient", () => {
    const result = classifyAiError(new Error("Worker threw exception 1031"));
    expect(result).toEqual({ category: "timeout", severity: "transient" });
  });
});

describe("extractHttpStatus", () => {
  it("parses 'API error 429:' -> 429", () => {
    expect(extractHttpStatus("API error 429: too many")).toBe(429);
  });

  it("parses 'HTTP 503' -> 503", () => {
    expect(extractHttpStatus("HTTP 503")).toBe(503);
  });

  it("returns undefined for random error", () => {
    expect(extractHttpStatus("some random error")).toBeUndefined();
  });
});

describe("sanitizeResponse", () => {
  it("truncates to 2048 characters", () => {
    const long = "a".repeat(3000);
    expect(sanitizeResponse(long)!.length).toBe(2048);
  });

  it("redacts API key patterns", () => {
    const body = 'Error: invalid key sk-abc123def456ghij789klmno';
    expect(sanitizeResponse(body)).toContain("[REDACTED]");
    expect(sanitizeResponse(body)).not.toContain("sk-abc123");
  });

  it("returns undefined for undefined input", () => {
    expect(sanitizeResponse(undefined)).toBeUndefined();
  });
});

describe("writeAiError", () => {
  it("calls prisma.aiServiceError.create with correct shape", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: "err_1" });
    const prisma = { aiServiceError: { create: mockCreate } };

    const data: AIServiceErrorData = {
      service: "stt",
      provider: "openai",
      model: "whisper-1",
      operation: "transcribe",
      correlationId: "corr-123",
      jobId: "job-1",
      episodeId: "ep-1",
      category: "rate_limit",
      severity: "transient",
      httpStatus: 429,
      errorMessage: "Too many requests",
      requestDurationMs: 150,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 3,
      willRetry: true,
    };

    await writeAiError(prisma, data);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.service).toBe("stt");
    expect(callData.provider).toBe("openai");
    expect(callData.category).toBe("rate_limit");
  });

  it("does not throw when prisma.create fails", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("DB connection failed"));
    const prisma = { aiServiceError: { create: mockCreate } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const data: AIServiceErrorData = {
      service: "stt",
      provider: "openai",
      model: "whisper-1",
      operation: "transcribe",
      correlationId: "corr-123",
      category: "rate_limit",
      severity: "transient",
      errorMessage: "Too many requests",
      requestDurationMs: 150,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 0,
      willRetry: false,
    };

    // Should not throw
    await writeAiError(prisma, data);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logLine = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logLine.action).toBe("ai_error_write_failed");

    consoleSpy.mockRestore();
  });
});

describe("AiProviderError", () => {
  it("creates error with structured context", () => {
    const err = new AiProviderError({
      message: "API error 429",
      provider: "anthropic",
      model: "claude-3-haiku",
      httpStatus: 429,
      requestDurationMs: 100,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AiProviderError");
    expect(err.provider).toBe("anthropic");
    expect(err.model).toBe("claude-3-haiku");
    expect(err.httpStatus).toBe(429);
    expect(err.requestDurationMs).toBe(100);
  });
});
