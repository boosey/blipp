import React, { useState, useEffect } from "react";
import {
  FileText,
  FileJson,
  FileAudio,
  HardDrive,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAdminFetch } from "@/lib/admin-api";
import { formatBytes } from "@/lib/admin-formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkProductSummary, WorkProductType } from "@/types/admin";
import { AudioPlayer } from "./audio-players";

export const WP_TYPE_CONFIG: Record<
  WorkProductType,
  { icon: React.ElementType; label: string; color: string }
> = {
  TRANSCRIPT: { icon: FileText, label: "Transcript", color: "#3B82F6" },
  CLAIMS: { icon: FileJson, label: "Claims", color: "#8B5CF6" },
  NARRATIVE: { icon: FileText, label: "Narrative", color: "#F59E0B" },
  AUDIO_CLIP: { icon: FileAudio, label: "Audio Clip", color: "#10B981" },
  BRIEFING_AUDIO: { icon: FileAudio, label: "Briefing", color: "#EC4899" },
};

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex gap-[1.5px]">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="w-[5px] h-3 rounded-[1px]"
          style={{ background: i < score ? color : "rgba(255,255,255,0.08)" }}
        />
      ))}
    </div>
  );
}

interface ClaimRow {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
  excerpt?: string;
}

export function ClaimsTable({ content }: { content: string }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  let claims: ClaimRow[];
  try {
    claims = JSON.parse(content);
    if (!Array.isArray(claims)) return null;
  } catch {
    return null;
  }

  const hasExcerpts = claims.some((c) => c.excerpt);

  const toggleRow = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <table className="w-full text-[10px] border-collapse">
      <thead>
        <tr className="border-b border-white/15">
          {hasExcerpts && <th className="w-5" />}
          <th className="text-left px-2.5 py-1.5 text-[9px] text-[#6B7280] uppercase tracking-wider font-medium">Claim</th>
          <th className="text-left px-2 py-1.5 text-[9px] text-[#6B7280] uppercase tracking-wider font-medium w-20">Speaker</th>
          <th className="text-center px-2 py-1.5 text-[9px] text-[#6B7280] uppercase tracking-wider font-medium w-[72px]">Importance</th>
          <th className="text-center px-2 py-1.5 text-[9px] text-[#6B7280] uppercase tracking-wider font-medium w-[72px]">Novelty</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((c, i) => {
          const isOpen = expanded.has(i);
          const colSpan = hasExcerpts ? 5 : 4;
          return (
            <React.Fragment key={i}>
              <tr
                className={`border-b border-white/5 ${c.excerpt ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
                onClick={() => c.excerpt && toggleRow(i)}
              >
                {hasExcerpts && (
                  <td className="pl-2 py-2 align-top w-5">
                    {c.excerpt && (isOpen ? <ChevronDown className="w-3 h-3 text-[#6B7280]" /> : <ChevronRight className="w-3 h-3 text-[#6B7280]" />)}
                  </td>
                )}
                <td className="px-2.5 py-2 text-[#F9FAFB] leading-relaxed break-words">{c.claim}</td>
                <td className="px-2 py-2 align-top">
                  <span className="text-[9px] bg-[#1E3A5F] text-[#60A5FA] px-1.5 py-0.5 rounded-full whitespace-nowrap">{c.speaker}</span>
                </td>
                <td className="px-2 py-2 align-top">
                  <ScoreBar score={c.importance} color="#22C55E" />
                </td>
                <td className="px-2 py-2 align-top">
                  <ScoreBar score={c.novelty} color="#F59E0B" />
                </td>
              </tr>
              {isOpen && c.excerpt && (
                <tr className="border-b border-white/5">
                  <td colSpan={colSpan} className="px-4 py-2.5 bg-white/[0.02]">
                    <div className="text-[10px] text-[#9CA3AF] leading-relaxed italic border-l-2 border-[#8B5CF6]/40 pl-3">
                      {c.excerpt}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

interface WorkProductPreview {
  id: string;
  type: WorkProductType;
  r2Key: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  contentType: "text" | "json" | "audio";
  content: string | null;
  truncated?: boolean;
  message?: string;
}

export function StepWorkProductPanel({ wp }: { wp: WorkProductSummary }) {
  const apiFetch = useAdminFetch();
  const [preview, setPreview] = useState<WorkProductPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAudio = wp.type === "AUDIO_CLIP" || wp.type === "BRIEFING_AUDIO";

  useEffect(() => {
    if (isAudio) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ data: WorkProductPreview }>(`/requests/work-product/${wp.id}/preview`)
      .then((r) => setPreview(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [apiFetch, wp.id, isAudio]);

  const cfg = WP_TYPE_CONFIG[wp.type] ?? WP_TYPE_CONFIG.TRANSCRIPT;
  const meta = (preview?.metadata ?? wp.metadata) as Record<string, unknown> | null;

  if (loading) {
    return (
      <div className="mt-1 rounded-md bg-[#0A1628] border border-white/5 overflow-hidden">
        <Skeleton className="h-16 bg-white/5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-1 rounded bg-[#EF4444]/10 border border-[#EF4444]/20 p-2 text-[10px] text-[#EF4444]">
        Failed to load: {error}
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-md bg-[#0A1628] border border-white/5 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-2.5 py-1 bg-[#0F1D32] border-b border-white/5">
        <cfg.icon className="h-2.5 w-2.5" style={{ color: cfg.color }} />
        <span className="text-[8px] font-medium" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <span className="text-[8px] text-[#9CA3AF] font-mono truncate flex-1">
          {wp.r2Key}
        </span>
        {wp.sizeBytes != null && (
          <span className="text-[8px] text-[#9CA3AF] font-mono tabular-nums shrink-0">
            {formatBytes(wp.sizeBytes)}
          </span>
        )}
        {meta && Object.keys(meta).length > 0 && (
          <span className="text-[8px] text-[#9CA3AF] font-mono shrink-0">
            {Object.entries(meta)
              .filter(([, v]) => v != null && v !== false)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </span>
        )}
      </div>

      {/* Content area */}
      {isAudio ? (
        <AudioPlayer wpId={wp.id} sizeBytes={wp.sizeBytes} />
      ) : preview?.content == null ? (
        <div className="px-2.5 py-2 text-[10px] text-[#9CA3AF] italic">
          {preview?.message ?? "No content available"}
        </div>
      ) : preview.contentType === "json" && wp.type === "CLAIMS" ? (
        <div className="max-h-56 overflow-y-auto">
          <ClaimsTable content={preview.content!} />
        </div>
      ) : preview.contentType === "json" ? (
        <div className="max-h-56 overflow-y-auto">
          <pre className="px-2.5 py-2 text-[10px] font-mono text-[#F9FAFB]/80 whitespace-pre-wrap break-all leading-relaxed">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(preview.content!), null, 2);
              } catch {
                return preview.content;
              }
            })()}
          </pre>
          {preview.truncated && (
            <div className="px-2.5 py-1 border-t border-white/5 text-[9px] text-[#F59E0B]">
              Content truncated — showing first 50KB
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <pre className="px-2.5 py-2 text-[10px] font-mono text-[#F9FAFB]/80 whitespace-pre-wrap break-words leading-relaxed">
            {preview.content}
          </pre>
          {preview.truncated && (
            <div className="px-2.5 py-1 border-t border-white/5 text-[9px] text-[#F59E0B]">
              Content truncated — showing first 50KB
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkProductBadge({ wp }: { wp: WorkProductSummary }) {
  const cfg = WP_TYPE_CONFIG[wp.type] ?? WP_TYPE_CONFIG.TRANSCRIPT;
  const Icon = cfg.icon;
  const meta = wp.metadata as Record<string, unknown> | null;
  const details: string[] = [];
  if (wp.sizeBytes != null) details.push(formatBytes(wp.sizeBytes));
  if (meta?.claimCount != null) details.push(`${meta.claimCount} claims`);
  if (meta?.wordCount != null) details.push(`${meta.wordCount} words`);

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
      title={`${cfg.label}: ${wp.r2Key}${details.length ? ` (${details.join(", ")})` : ""}`}
    >
      <Icon className="h-2.5 w-2.5" />
      <HardDrive className="h-2 w-2 opacity-60" />
      {cfg.label}
      {details.length > 0 && (
        <span className="opacity-70 font-mono">{details.join(" · ")}</span>
      )}
    </span>
  );
}
