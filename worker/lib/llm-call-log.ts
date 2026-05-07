import type { AiUsage } from "./ai-usage";

export type LlmCallStatus =
  | "SUCCESS"
  | "PARSE_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "OTHER_ERROR";

export interface LlmCallRecord {
  jobId?: string | null;
  stepId?: string | null;
  episodeId?: string | null;
  stage?: string;
  provider: string;
  model: string;
  status: LlmCallStatus;
  usage?: Partial<AiUsage> | null;
  durationMs?: number;
  errorCategory?: string;
  errorMessage?: string;
}

// Append-only LLM attempt log. Captures every billable call — successful or
// failed — so cost reporting can reconcile against provider invoices even
// when chain-fallthrough or retries overwrite PipelineStep's final-attempt
// rollup. Fire-and-forget: a logging failure must never break the pipeline.
export async function recordLlmCall(prisma: any, data: LlmCallRecord): Promise<void> {
  try {
    await prisma.llmCall.create({
      data: {
        jobId: data.jobId ?? null,
        stepId: data.stepId ?? null,
        episodeId: data.episodeId ?? null,
        stage: data.stage ?? null,
        provider: data.provider,
        model: data.model,
        status: data.status,
        inputTokens: data.usage?.inputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
        cacheCreationTokens: data.usage?.cacheCreationTokens ?? 0,
        cacheReadTokens: data.usage?.cacheReadTokens ?? 0,
        cost: data.usage?.cost ?? null,
        durationMs: data.durationMs ?? null,
        errorCategory: data.errorCategory ?? null,
        errorMessage: data.errorMessage ? data.errorMessage.slice(0, 500) : null,
      },
    });
  } catch {
    // Telemetry must never break the pipeline.
  }
}

export function categorizeError(err: unknown): { category: string; status: LlmCallStatus } {
  const status = (err as any)?.httpStatus ?? (err as any)?.status;
  const msg = err instanceof Error ? err.message : String(err);
  if ((err as any)?.name === "LlmParseError") return { category: "parse", status: "PARSE_ERROR" };
  if (status === 429 || /rate.?limit/i.test(msg)) return { category: "rate_limit", status: "RATE_LIMITED" };
  if (status === 401 || status === 403) return { category: "auth", status: "AUTH_ERROR" };
  if (status === 408 || status === 504 || status === 524 || /timeout/i.test(msg))
    return { category: "timeout", status: "TIMEOUT" };
  return { category: "other", status: "OTHER_ERROR" };
}
