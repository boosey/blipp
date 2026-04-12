// worker/lib/ai-errors.ts

export type AiErrorCategory =
  | "rate_limit"
  | "timeout"
  | "auth"
  | "model_not_found"
  | "content_filter"
  | "invalid_request"
  | "server_error"
  | "network"
  | "quota_exceeded"
  | "unknown";

export type AiErrorSeverity = "transient" | "permanent";

export interface AIServiceErrorData {
  service: "stt" | "distillation" | "narrative" | "tts";
  provider: string;
  model: string;
  operation: string;
  correlationId: string;
  jobId?: string;
  stepId?: string;
  episodeId?: string;
  category: AiErrorCategory;
  severity: AiErrorSeverity;
  httpStatus?: number;
  errorMessage: string;
  rawResponse?: string;
  requestDurationMs: number;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  rateLimitRemaining?: number;
  rateLimitResetAt?: Date;
}

/**
 * Classify an error from an AI service call into a category and severity.
 */
export function classifyAiError(
  err: unknown,
  httpStatus?: number,
  responseBody?: string
): { category: AiErrorCategory; severity: AiErrorSeverity } {
  const message = err instanceof Error ? err.message : String(err);
  const status = httpStatus ?? extractHttpStatus(message);

  if (status === 429 || message.includes("rate_limit") || message.toLowerCase().includes("too many requests")) {
    return { category: "rate_limit", severity: "transient" };
  }
  if (status === 504 || status === 408 || message.includes("timeout") || message.includes("1031")) {
    return { category: "timeout", severity: "transient" };
  }
  if (status && status >= 500 && status < 600) {
    return { category: "server_error", severity: "transient" };
  }
  if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.toLowerCase().includes("network")) {
    return { category: "network", severity: "transient" };
  }
  if (status === 401 || status === 403 || message.includes("api_key") || message.toLowerCase().includes("unauthorized")) {
    return { category: "auth", severity: "permanent" };
  }
  if (status === 404 || message.includes("model_not_found") || message.includes("does not exist")) {
    return { category: "model_not_found", severity: "permanent" };
  }
  if (message.includes("content_policy") || message.includes("content_filter") || message.includes("safety")) {
    return { category: "content_filter", severity: "permanent" };
  }
  if (message.includes("quota") || message.includes("billing") || message.includes("insufficient_quota")) {
    return { category: "quota_exceeded", severity: "permanent" };
  }
  if (status === 400 || message.includes("invalid_request")) {
    return { category: "invalid_request", severity: "permanent" };
  }
  return { category: "unknown", severity: "transient" };
}

/**
 * Extract HTTP status code from error message strings.
 */
export function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/(?:error|HTTP)\s+(\d{3})/i);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Extract retry-after delay (ms) from a rate-limit error. Checks:
 * 1. AiProviderError.rateLimitResetAt (absolute timestamp from headers)
 * 2. Groq-style "try again in Xs" in error message
 * Falls back to defaultMs.
 */
export function parseRetryAfterMs(err: unknown, defaultMs = 5_000): number {
  if (err instanceof AiProviderError && err.rateLimitResetAt) {
    const delta = err.rateLimitResetAt.getTime() - Date.now();
    if (delta > 0) return Math.min(delta, 30_000);
  }
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/try again in ([\d.]+)s/i);
  if (match) return Math.min(Math.ceil(parseFloat(match[1]) * 1_000), 30_000);
  return defaultMs;
}

/**
 * Whether an error is a rate-limit (429) that should be retried with backoff
 * rather than treated as a provider failure.
 */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof AiProviderError && err.httpStatus === 429) return true;
  const { category } = classifyAiError(err);
  return category === "rate_limit";
}

/**
 * Truncate and sanitize a raw error response body for storage.
 */
export function sanitizeResponse(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const truncated = body.slice(0, 2048);
  return truncated.replace(/(?:sk|key|token|secret|bearer)[_-][\w-]{16,}/gi, "[REDACTED]");
}

/**
 * Write an AI service error to the database. Fire-and-forget.
 */
export async function writeAiError(
  prisma: any,
  data: AIServiceErrorData
): Promise<void> {
  try {
    await prisma.aiServiceError.create({
      data: {
        service: data.service,
        provider: data.provider,
        model: data.model,
        operation: data.operation,
        correlationId: data.correlationId,
        jobId: data.jobId,
        stepId: data.stepId,
        episodeId: data.episodeId,
        category: data.category,
        severity: data.severity,
        httpStatus: data.httpStatus,
        errorMessage: data.errorMessage.slice(0, 2048),
        rawResponse: sanitizeResponse(data.rawResponse),
        requestDurationMs: data.requestDurationMs,
        retryCount: data.retryCount,
        maxRetries: data.maxRetries,
        willRetry: data.willRetry,
        rateLimitRemaining: data.rateLimitRemaining,
        rateLimitResetAt: data.rateLimitResetAt,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      action: "ai_error_write_failed",
      service: data.service,
      provider: data.provider,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
  }
}

/**
 * Error thrown by AI provider implementations with structured context.
 */
export class AiProviderError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly httpStatus?: number;
  readonly rawResponse?: string;
  readonly requestDurationMs: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitResetAt?: Date;

  constructor(opts: {
    message: string;
    provider: string;
    model: string;
    httpStatus?: number;
    rawResponse?: string;
    requestDurationMs: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: Date;
  }) {
    super(opts.message);
    this.name = "AiProviderError";
    this.provider = opts.provider;
    this.model = opts.model;
    this.httpStatus = opts.httpStatus;
    this.rawResponse = opts.rawResponse;
    this.requestDurationMs = opts.requestDurationMs;
    this.rateLimitRemaining = opts.rateLimitRemaining;
    this.rateLimitResetAt = opts.rateLimitResetAt;
  }
}
