import type { CostSummary } from "@/types/admin";

// ── Constants ──

export const STAGE_NAMES = ["Transcription", "Distillation", "Narrative Gen", "Audio Gen", "Assembly"];

export const STAGE_COLOR_MAP: Record<string, string> = {
  TRANSCRIPTION: "#8B5CF6",
  DISTILLATION: "#F59E0B",
  NARRATIVE_GENERATION: "#10B981",
  AUDIO_GENERATION: "#06B6D4",
  BRIEFING_ASSEMBLY: "#14B8A6",
};

// ── Formatters ──

export function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function statusColor(status: string) {
  switch (status) {
    case "completed": return "text-[#10B981]";
    case "failed": return "text-[#EF4444]";
    case "in_progress": return "text-[#F59E0B]";
    default: return "text-[#9CA3AF]";
  }
}

export function severityColor(severity: string) {
  switch (severity) {
    case "critical": return { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", border: "border-[#EF4444]/30" };
    case "warning": return { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]", border: "border-[#F59E0B]/30" };
    default: return { bg: "bg-[#3B82F6]/10", text: "text-[#3B82F6]", border: "border-[#3B82F6]/30" };
  }
}

export function humanizeType(type: string): string {
  return type.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function humanizeTitle(title: string): string {
  return title.replace(/^[A-Z_]+/, (match) => humanizeType(match));
}

// ── Issue parsing ──

function extractMessage(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of ["message", "msg", "reason", "detail", "details", "statusText", "description"]) {
    if (typeof o[key] === "string" && (o[key] as string).length > 0) return o[key] as string;
  }
  if (o.error && typeof o.error === "object") return extractMessage(o.error);
  if (typeof o.error === "string" && o.error.length > 0) return o.error;
  return null;
}

function findJson(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { /* continue */ }
  for (const ch of ["{", "["]) {
    const idx = raw.indexOf(ch);
    if (idx >= 0) {
      try { return JSON.parse(raw.slice(idx)); } catch { /* continue */ }
    }
  }
  if (raw.includes('\\"') || raw.includes("\\{")) {
    try { return JSON.parse(JSON.parse(`"${raw}"`)); } catch { /* continue */ }
  }
  return null;
}

export function summarizeIssue(raw: string): { summary: string; rawJson: string | null } {
  if (!raw || raw === "Unknown error") return { summary: raw, rawJson: null };
  const parsed = findJson(raw);
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { summary: "Empty error array", rawJson: raw };
      const first = parsed[0];
      const firstMsg = typeof first === "string" ? first : extractMessage(first) ?? JSON.stringify(first);
      const suffix = parsed.length > 1 ? ` (+${parsed.length - 1} more)` : "";
      return { summary: `${firstMsg}${suffix}`, rawJson: raw };
    }
    const msg = extractMessage(parsed);
    if (msg) return { summary: msg, rawJson: raw };
    return { summary: "Error occurred (see details)", rawJson: raw };
  }
  return { summary: raw, rawJson: null };
}
