import { Input } from "@/components/ui/input";
import type { AiModelProviderEntry } from "@/types/admin";
import type { AIStage } from "@/lib/ai-models";

export const STAGES: AIStage[] = ["stt", "distillation", "narrative", "tts", "geoClassification"];

export function formatPrice(p: AiModelProviderEntry): string {
  if (p.pricePerMinute != null) return `$${p.pricePerMinute.toFixed(5)}/min`;
  if (p.priceInputPerMToken != null)
    return `$${p.priceInputPerMToken}/$${p.priceOutputPerMToken} /1M tok`;
  if (p.pricePerKChars != null) return `$${p.pricePerKChars}/1K chars`;
  return "\u2014";
}

export function formatLimits(limits?: Record<string, unknown> | null): string {
  if (!limits || Object.keys(limits).length === 0) return "\u2014";
  return Object.entries(limits)
    .map(([k, v]) => {
      if (k === "maxFileSizeBytes" && typeof v === "number") return `${(v / 1024 / 1024).toFixed(0)}MB max`;
      if (k === "maxInputChars" && typeof v === "number") return `${v.toLocaleString()} chars max`;
      return `${k}: ${v}`;
    })
    .join(", ");
}

export function formatMonthlyCost(cost: number | null): string {
  if (cost == null) return "\u2014";
  if (cost < 0.01) return "<$0.01/mo";
  return `$${cost.toFixed(2)}/mo`;
}

/** Determine the primary limit-relevant stage for a multi-stage model */
export function getLimitStage(stages: string[]): string | null {
  if (stages.includes("stt")) return "stt";
  if (stages.includes("tts")) return "tts";
  return null;
}

export function buildLimitsPayload(stage: string, limitValue: string): Record<string, unknown> | undefined {
  if (!limitValue.trim()) return undefined;
  const num = parseFloat(limitValue);
  if (isNaN(num)) return undefined;
  if (stage === "stt") return { maxFileSizeBytes: Math.round(num * 1024 * 1024) };
  if (stage === "tts") return { maxInputChars: Math.round(num) };
  return undefined;
}

export function extractLimitValue(stage: string, limits?: Record<string, unknown> | null): string {
  if (!limits) return "";
  if (stage === "stt" && typeof limits.maxFileSizeBytes === "number") return (limits.maxFileSizeBytes / 1024 / 1024).toString();
  if (stage === "tts" && typeof limits.maxInputChars === "number") return limits.maxInputChars.toString();
  return "";
}
