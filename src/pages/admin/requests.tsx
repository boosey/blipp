import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { usePolling } from "@/hooks/use-polling";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  Inbox,
  Search,
  ToggleLeft,
  ToggleRight,
  SkipForward,
  Minus,
  Zap,
  FileText,
  FileJson,
  FileAudio,
  HardDrive,
  List,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@clerk/clerk-react";
import { useAdminFetch } from "@/lib/admin-api";
import { getApiBase } from "@/lib/api-base";
import type {
  BriefingRequest,
  BriefingRequestItem,
  BriefingRequestStatus,
  JobProgress,
  StepProgress,
  PipelineStepStatus,
  AdminPodcast,
  AdminEpisode,
  WorkProductSummary,
  WorkProductType,
  PipelineEventSummary,
} from "@/types/admin";
import { DURATION_TIERS } from "@/lib/duration-tiers";

// ── Constants ──

const STATUS_TABS: { value: BriefingRequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_STYLES: Record<
  BriefingRequestStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  PROCESSING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
};

const STEP_STATUS_ICON: Record<
  PipelineStepStatus,
  { icon: React.ElementType; color: string; label: string; spin?: boolean }
> = {
  COMPLETED: { icon: CheckCircle2, color: "#10B981", label: "Done" },
  IN_PROGRESS: { icon: Loader2, color: "#3B82F6", label: "Running", spin: true },
  PENDING: { icon: Minus, color: "#9CA3AF", label: "Pending" },
  FAILED: { icon: XCircle, color: "#EF4444", label: "Failed" },
  SKIPPED: { icon: SkipForward, color: "#6B7280", label: "Skipped" },
};

const PAGE_SIZE = 20;

// ── Helpers ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ──

function StatusBadge({ status }: { status: BriefingRequestStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

function StepStatusIcon({ step }: { step: StepProgress }) {
  const cfg = STEP_STATUS_ICON[step.status];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1" title={cfg.label}>
      <Icon
        className={cn("h-3.5 w-3.5", cfg.spin && "animate-spin")}
        style={{ color: cfg.color }}
      />
      <span className="text-[10px]" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </span>
  );
}

function DurationTierBadge({ minutes }: { minutes: number }) {
  return (
    <Badge className="bg-[#8B5CF6]/15 text-[#8B5CF6] text-[9px] font-mono tabular-nums shrink-0">
      {minutes}m
    </Badge>
  );
}

const WP_TYPE_CONFIG: Record<
  WorkProductType,
  { icon: React.ElementType; label: string; color: string }
> = {
  TRANSCRIPT: { icon: FileText, label: "Transcript", color: "#3B82F6" },
  CLAIMS: { icon: FileJson, label: "Claims", color: "#8B5CF6" },
  NARRATIVE: { icon: FileText, label: "Narrative", color: "#F59E0B" },
  AUDIO_CLIP: { icon: FileAudio, label: "Audio Clip", color: "#10B981" },
  BRIEFING_AUDIO: { icon: FileAudio, label: "Briefing", color: "#EC4899" },
  SOURCE_AUDIO: { icon: FileAudio, label: "Source Audio", color: "#F97316" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function WorkProductBadge({ wp }: { wp: WorkProductSummary }) {
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

/** Audio player that fetches audio from the admin API with auth. */
function AudioPlayer({ wpId, sizeBytes }: { wpId: string; sizeBytes?: number }) {
  const { getToken } = useAuth();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAudio = useCallback(async () => {
    if (audioUrl || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/admin/requests/work-product/${wpId}/audio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [getToken, wpId, audioUrl, isLoading]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (loadError) {
    return (
      <div className="px-2.5 py-2 text-[10px] text-[#EF4444]">
        Failed to load audio: {loadError}
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="px-2.5 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={loadAudio}
          disabled={isLoading}
          className="h-6 text-[10px] text-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/10"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <FileAudio className="h-3 w-3 mr-1" />
          )}
          {isLoading ? "Loading..." : "Load audio"}
        </Button>
        {sizeBytes != null && (
          <span className="text-[9px] text-[#9CA3AF] font-mono">{formatBytes(sizeBytes)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="px-2.5 py-2">
      <audio controls className="w-full h-8" style={{ filter: "invert(0.85) hue-rotate(180deg)" }}>
        <source src={audioUrl} type="audio/mpeg" />
      </audio>
    </div>
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

function StepWorkProductPanel({ wp }: { wp: WorkProductSummary }) {
  const apiFetch = useAdminFetch();
  const [preview, setPreview] = useState<WorkProductPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAudio = wp.type === "AUDIO_CLIP" || wp.type === "BRIEFING_AUDIO" || wp.type === "SOURCE_AUDIO";

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

function ScoreBar({ score, color }: { score: number; color: string }) {
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

function ClaimsTable({ content }: { content: string }) {
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const EVENT_LEVEL_COLORS: Record<string, string> = {
  ERROR: "#EF4444",
  WARN: "#F59E0B",
  INFO: "#9CA3AF",
  DEBUG: "#6B7280",
};

const SUCCESS_KEYWORDS = ["saved", "extracted", "generated", "completed", "found", "fetched", "created", "linked", "assembly complete"];

function isSuccessEvent(event: PipelineEventSummary): boolean {
  if (event.level !== "INFO") return false;
  const lower = event.message.toLowerCase();
  return SUCCESS_KEYWORDS.some((kw) => lower.includes(kw));
}

function eventColor(event: PipelineEventSummary): string {
  if (event.level === "ERROR") return EVENT_LEVEL_COLORS.ERROR;
  if (event.level === "WARN") return EVENT_LEVEL_COLORS.WARN;
  if (isSuccessEvent(event)) return "#22C55E";
  if (event.level === "DEBUG") return EVENT_LEVEL_COLORS.DEBUG;
  return EVENT_LEVEL_COLORS.INFO;
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatEventDataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (value > 10_000) return value.toLocaleString();
    return String(value);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" && value.length > 120) return value.slice(0, 120) + "…";
  return String(value);
}

function EventTimeline({
  events,
  stepStatus,
}: {
  events: PipelineEventSummary[];
  stepStatus: PipelineStepStatus;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const filtered = showDebug ? events : events.filter((e) => e.level !== "DEBUG");
  const debugCount = events.filter((e) => e.level === "DEBUG").length;
  const hasData = events.some((e) => e.data && Object.keys(e.data).length > 0);

  const borderColor =
    stepStatus === "FAILED" ? "#EF4444" :
    stepStatus === "IN_PROGRESS" ? "#3B82F6" :
    stepStatus === "COMPLETED" ? "#22C55E" :
    "#6B7280";

  return (
    <div className="py-1">
      <div className="flex items-center gap-3 mb-1">
        {debugCount > 0 && (
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="flex items-center gap-1 text-[9px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
          >
            {showDebug ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {showDebug ? "Hide" : "Show"} debug ({debugCount})
          </button>
        )}
        {hasData && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[9px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
          >
            {showDetails ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {showDetails ? "Hide" : "Show"} details
          </button>
        )}
      </div>
      <div
        className="border-l-2 pl-3 space-y-0.5"
        style={{ borderColor }}
      >
        {filtered.map((event) => (
          <div key={event.id}>
            <div className="flex items-start gap-2 text-[10px]">
              <span className="text-[#6B7280] font-mono text-[9px] shrink-0 tabular-nums">
                {formatEventTime(event.createdAt)}
              </span>
              <span style={{ color: eventColor(event) }}>
                {event.message}
              </span>
            </div>
            {showDetails && event.data && Object.keys(event.data).length > 0 && (
              <div className="ml-[70px] mt-0.5 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(event.data).map(([key, val]) => (
                  <span key={key} className="text-[9px]">
                    <span className="text-[#6B7280]">{key}:</span>{" "}
                    <span className="text-[#A1A1AA] font-mono">{formatEventDataValue(val)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <span className="text-[9px] text-[#6B7280] italic">No events recorded</span>
        )}
      </div>
    </div>
  );
}

function ExpandableStepRow({
  step,
}: {
  step: StepProgress;
}) {
  const events = step.events ?? [];
  const wps = [...(step.workProducts ?? [])].sort((a, b) =>
    a.type === "SOURCE_AUDIO" ? -1 : b.type === "SOURCE_AUDIO" ? 1 : 0
  );
  const hasContent = events.length > 0 || wps.length > 0;

  const [expanded, setExpanded] = useState(
    step.status === "FAILED" || step.status === "IN_PROGRESS"
  );
  const [showEvents, setShowEvents] = useState(
    step.status === "FAILED" || step.status === "IN_PROGRESS"
  );
  const [showWps, setShowWps] = useState(false);

  const infoEventCount = events.filter((e) => e.level !== "DEBUG").length;

  return (
    <div>
      {/* Main step row */}
      <div
        className={cn(
          "grid grid-cols-[14px_90px_60px_55px_60px_60px_60px_auto_1fr] gap-2 items-center text-[10px] py-0.5",
          hasContent && "cursor-pointer hover:bg-white/[0.02] rounded -mx-1 px-1"
        )}
        onClick={hasContent ? () => setExpanded((v) => !v) : undefined}
      >
        <div>
          {hasContent ? (
            expanded ? (
              <ChevronDown className="h-2.5 w-2.5 text-[#9CA3AF]" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5 text-[#9CA3AF]" />
            )
          ) : null}
        </div>

        <span className="text-[#9CA3AF] truncate">{formatStageName(step.stage)}</span>

        <div className="flex items-center gap-1">
          <StepStatusIcon step={step} />
          {step.cached && (
            <span title="Cached"><Zap className="h-2.5 w-2.5 text-[#F59E0B]" /></span>
          )}
        </div>

        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.durationMs != null ? `${step.durationMs}ms` : "—"}
        </span>

        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.inputTokens != null ? formatTokens(step.inputTokens) : "—"}
        </span>

        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.outputTokens != null ? formatTokens(step.outputTokens) : "—"}
        </span>

        <span className="text-[9px] text-[#10B981] font-mono tabular-nums text-right">
          {step.cost != null ? `$${step.cost.toFixed(4)}` : "—"}
        </span>

        <div className="flex items-center gap-1">
          {wps.length > 0 && wps.map((wp) => (
            <WorkProductBadge key={wp.id} wp={wp} />
          ))}
        </div>

        <div className="flex items-center gap-1 min-w-0">
          {step.model && (
            <span className="text-[8px] text-[#8B5CF6] font-mono tabular-nums truncate max-w-[120px]" title={step.model}>
              {step.model.split("+").map(m => m.split("-").slice(0, 3).join("-")).join("+")}
            </span>
          )}
          {step.status === "FAILED" && step.errorMessage && (
            <span className="text-[9px] text-[#EF4444] truncate max-w-[200px]" title={step.errorMessage}>
              {step.errorMessage}
            </span>
          )}
        </div>
      </div>

      {/* Nested accordion: Event Log + Work Products */}
      {expanded && (
        <div className="pl-6 space-y-0.5 pb-1">
          {events.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] py-0.5 transition-colors w-full text-left"
                onClick={() => setShowEvents((v) => !v)}
              >
                {showEvents ? (
                  <ChevronDown className="h-2.5 w-2.5" />
                ) : (
                  <ChevronRight className="h-2.5 w-2.5" />
                )}
                <List className="h-2.5 w-2.5" />
                <span>Event Log</span>
                <span className="text-[#6B7280]">({infoEventCount})</span>
              </button>
              {showEvents && (
                <div className="pl-5">
                  <EventTimeline events={events} stepStatus={step.status} />
                </div>
              )}
            </div>
          )}

          {wps.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] py-0.5 transition-colors w-full text-left"
                onClick={() => setShowWps((v) => !v)}
              >
                {showWps ? (
                  <ChevronDown className="h-2.5 w-2.5" />
                ) : (
                  <ChevronRight className="h-2.5 w-2.5" />
                )}
                <HardDrive className="h-2.5 w-2.5" />
                <span>Work Products</span>
                <span className="text-[#6B7280]">({wps.length})</span>
              </button>
              {showWps && (
                <div className="pl-5 space-y-1">
                  {wps.map((wp) => (
                    <StepWorkProductPanel key={wp.id} wp={wp} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestCostSummary({ jobs }: { jobs: JobProgress[] }) {
  const allSteps = jobs.flatMap((j) => j.steps);
  const totalCost = allSteps.reduce((s, st) => s + (st.cost ?? 0), 0);
  const totalIn = allSteps.reduce((s, st) => s + (st.inputTokens ?? 0), 0);
  const totalOut = allSteps.reduce((s, st) => s + (st.outputTokens ?? 0), 0);
  const models = [...new Set(allSteps.map((s) => s.model).filter(Boolean))] as string[];

  if (totalCost === 0 && totalIn === 0 && models.length === 0) return null;

  return (
    <div className="flex items-center gap-4 py-1.5 mb-1 text-[10px] border-b border-white/5">
      <span className="text-[#9CA3AF] uppercase tracking-wider text-[9px]">Request Total</span>
      {totalCost > 0 && (
        <span className="text-[#10B981] font-mono tabular-nums">${totalCost.toFixed(4)}</span>
      )}
      {totalIn > 0 && (
        <span className="text-[#9CA3AF] font-mono tabular-nums">{totalIn.toLocaleString()} in / {totalOut.toLocaleString()} out</span>
      )}
      {models.length > 0 && (
        <span className="text-[#8B5CF6] font-mono tabular-nums">
          {models.map(m => m.split("+").map(p => p.split("-").slice(0, 3).join("-")).join("+")).join(", ")}
        </span>
      )}
    </div>
  );
}

function JobProgressTree({ jobs, highlightJobId, jobRef }: { jobs: JobProgress[]; highlightJobId?: string | null; jobRef?: React.RefObject<HTMLDivElement | null> }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-[10px] text-[#9CA3AF] py-2">No job progress data</div>
    );
  }

  return (
    <div className="py-1">
      {/* Column headers */}
      <div className="grid grid-cols-[14px_90px_60px_55px_60px_60px_60px_auto_1fr] gap-2 items-center text-[8px] uppercase tracking-wider text-[#9CA3AF]/60 pb-1 mb-1 border-b border-white/5">
        <span />
        <span>Stage</span>
        <span>Status</span>
        <span className="text-right">Time</span>
        <span className="text-right">Tok In</span>
        <span className="text-right">Tok Out</span>
        <span className="text-right">Cost</span>
        <span>Assets</span>
        <span>Info</span>
      </div>
      <div className="space-y-0.5">
      {jobs.map((job) => (
        <div key={job.jobId} ref={job.jobId === highlightJobId ? jobRef : undefined}>
          {jobs.length > 1 && (
            <div className={cn(
              "flex items-center gap-2 text-[10px] text-[#9CA3AF] py-1 mt-1 border-t border-white/5 first:border-t-0 first:mt-0",
              job.jobId === highlightJobId && "bg-[#3B82F6]/10 rounded px-1 -mx-1"
            )}>
              <span className="font-medium text-[#F9FAFB]">{job.episodeTitle}</span>
              {job.episodeDurationSeconds != null && (
                <span className="font-mono tabular-nums">{Math.round(job.episodeDurationSeconds / 60)}m ep</span>
              )}
              <span className="font-mono tabular-nums">{job.durationTier}m tier</span>
            </div>
          )}
          {jobs.length === 1 && job.episodeDurationSeconds != null && (
            <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF] py-1">
              <span>Episode: {Math.round(job.episodeDurationSeconds / 60)}m</span>
            </div>
          )}
          {job.steps.map((step) => (
            <ExpandableStepRow key={`${job.jobId}-${step.stage}`} step={step} />
          ))}
        </div>
      ))}
      </div>
    </div>
  );
}

function formatStageName(stage: string): string {
  switch (stage) {
    case "TRANSCRIPTION": return "Transcription";
    case "DISTILLATION": return "Distillation";
    case "NARRATIVE_GENERATION": return "Narrative Gen";
    case "AUDIO_GENERATION": return "Audio Gen";
    case "CLIP_GENERATION": return "Clip Gen"; // legacy
    case "BRIEFING_ASSEMBLY": return "Assembly";
    default: return stage;
  }
}

function RequestRow({
  request,
  expanded,
  onToggle,
  detail,
  detailLoading,
  highlightJobId,
  jobRef,
}: {
  request: BriefingRequest;
  expanded: boolean;
  onToggle: () => void;
  detail: BriefingRequest | null;
  detailLoading: boolean;
  highlightJobId?: string | null;
  jobRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const itemCount = request.items?.length ?? 0;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[24px_100px_1fr_80px_60px_80px_80px_100px] gap-3 items-center px-3 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={request.status} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#F9FAFB] truncate">
            {request.userEmail ?? request.userId}
          </span>
          {request.podcastTitle && (
            <span className="text-[10px] text-[#9CA3AF] truncate">
              {request.podcastTitle}{request.episodeTitle ? ` — ${request.episodeTitle}` : ""}
            </span>
          )}
          {request.isTest && (
            <Badge className="bg-[#F97316]/15 text-[#F97316] text-[9px] shrink-0">
              Test
            </Badge>
          )}
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {request.targetMinutes}m
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {itemCount}
        </div>
        <div className="text-xs text-[#9CA3AF]">
          {request.isTest ? "Test" : "User"}
        </div>
        <div className="text-[10px] text-[#10B981] font-mono tabular-nums">
          {request.totalCost != null ? `$${request.totalCost.toFixed(4)}` : "—"}
        </div>
        <div className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
          {relativeTime(request.createdAt)}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-10 bg-white/[0.01]">
          {/* Items summary */}
          {detailLoading ? (
            <div className="space-y-1 py-2">
              <Skeleton className="h-4 w-full bg-white/5" />
              <Skeleton className="h-4 w-3/4 bg-white/5" />
              <Skeleton className="h-4 w-1/2 bg-white/5" />
            </div>
          ) : detail?.jobProgress ? (
            <>
              <RequestCostSummary jobs={detail.jobProgress} />
              <JobProgressTree jobs={detail.jobProgress} highlightJobId={highlightJobId} jobRef={jobRef} />
            </>
          ) : (
            <div className="text-[10px] text-[#9CA3AF] py-2">
              No job progress data available
            </div>
          )}
          {detail?.errorMessage && (
            <div className="mt-2 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2">
              <pre className="text-[10px] text-[#EF4444]/80 font-mono whitespace-pre-wrap break-all">
                {detail.errorMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test Briefing Dialog ──

// ── Episode Picker (per-podcast single-select) ──

function EpisodePicker({
  podcastId,
  selectedEpisodeId,
  onSelect,
}: {
  podcastId: string;
  selectedEpisodeId: string | null;
  onSelect: (episodeId: string | null) => void;
}) {
  const apiFetch = useAdminFetch();
  const [episodes, setEpisodes] = useState<AdminEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: AdminEpisode[] }>(`/episodes?podcastId=${podcastId}&pageSize=50`)
      .then((r) => setEpisodes(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, podcastId]);

  const filtered = filter
    ? episodes.filter((e) => e.title.toLowerCase().includes(filter.toLowerCase()))
    : episodes;

  if (loading) {
    return (
      <div className="space-y-1 py-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF]" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter episodes..."
          className="h-7 pl-7 text-[10px] bg-[#0A1628] border-white/5 text-[#F9FAFB]"
        />
      </div>
      <ScrollArea className="max-h-32">
        <div className="space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-[10px] text-[#9CA3AF] py-2 text-center">No episodes found</div>
          ) : (
            filtered.map((ep) => (
              <button
                key={ep.id}
                onClick={() => onSelect(selectedEpisodeId === ep.id ? null : ep.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  selectedEpisodeId === ep.id
                    ? "bg-[#3B82F6]/15 border border-[#3B82F6]/30"
                    : "hover:bg-white/[0.03] border border-transparent"
                )}
              >
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border shrink-0",
                    selectedEpisodeId === ep.id
                      ? "bg-[#3B82F6] border-[#3B82F6]"
                      : "border-[#9CA3AF]/40"
                  )}
                />
                <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums shrink-0">
                  {new Date(ep.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-[10px] text-[#F9FAFB] truncate">{ep.title}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Test Briefing Dialog ──

interface PodcastSelection {
  podcastId: string;
  useLatest: boolean;
  episodeId: string | null;
  durationTier: number;
}

function TestBriefingDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [podcasts, setPodcasts] = useState<AdminPodcast[]>([]);
  const [loadingPodcasts, setLoadingPodcasts] = useState(false);
  const [selections, setSelections] = useState<PodcastSelection[]>([]);
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [podcastSearch, setPodcastSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingPodcasts(true);
    apiFetch<{ data: AdminPodcast[] }>("/podcasts")
      .then((r) => setPodcasts(r.data))
      .catch(console.error)
      .finally(() => setLoadingPodcasts(false));
  }, [open, apiFetch]);

  const selectedIds = new Set(selections.map((s) => s.podcastId));

  const togglePodcast = (id: string) => {
    if (selectedIds.has(id)) {
      setSelections((prev) => prev.filter((s) => s.podcastId !== id));
    } else {
      setSelections((prev) => [...prev, { podcastId: id, useLatest: true, episodeId: null, durationTier: 5 }]);
    }
  };

  const toggleLatest = (podcastId: string) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId
          ? { ...s, useLatest: !s.useLatest, episodeId: null }
          : s
      )
    );
  };

  const setEpisode = (podcastId: string, episodeId: string | null) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId ? { ...s, episodeId } : s
      )
    );
  };

  const setDurationTier = (podcastId: string, tier: number) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId ? { ...s, durationTier: tier } : s
      )
    );
  };

  const handleSubmit = async () => {
    if (selections.length === 0) return;
    const invalid = selections.some((s) => !s.useLatest && !s.episodeId);
    if (invalid) return;

    setSubmitting(true);
    try {
      const items: BriefingRequestItem[] = selections.map((s) => ({
        podcastId: s.podcastId,
        episodeId: s.useLatest ? null : s.episodeId,
        durationTier: s.durationTier,
        useLatest: s.useLatest,
      }));

      await apiFetch("/requests/test-briefing", {
        method: "POST",
        body: JSON.stringify({
          items,
          targetMinutes,
        }),
      });
      onOpenChange(false);
      setSelections([]);
      setTargetMinutes(5);
      setPodcastSearch("");
      onSuccess();
    } catch (e) {
      console.error("Failed to create test briefing:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPodcasts = podcastSearch
    ? podcasts.filter((p) => p.title.toLowerCase().includes(podcastSearch.toLowerCase()))
    : podcasts;

  const invalidCount = selections.filter((s) => !s.useLatest && !s.episodeId).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#F97316]" />
            Create Test Briefing
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duration input */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-[#F9FAFB] font-medium">Target Duration (minutes)</label>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">Total briefing length, 1-30 minutes</p>
            </div>
            <Input
              type="number"
              min={1}
              max={30}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Math.min(30, Math.max(1, Number(e.target.value))))}
              className="w-20 h-8 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
            />
          </div>

          <Separator className="bg-white/5" />

          {/* Podcast picker + episode selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#F9FAFB] font-medium">Podcasts & Episodes</label>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
                {selections.length} selected
              </Badge>
            </div>

            {/* Podcast search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
              <Input
                value={podcastSearch}
                onChange={(e) => setPodcastSearch(e.target.value)}
                placeholder="Search podcasts..."
                className="h-8 pl-8 text-xs bg-[#0F1D32] border-white/5 text-[#F9FAFB]"
              />
            </div>

            <ScrollArea className="h-72 rounded-md border border-white/5 bg-[#0F1D32]">
              <div className="p-2 space-y-0.5">
                {loadingPodcasts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-white/5 rounded" />
                  ))
                ) : filteredPodcasts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                    <Inbox className="h-5 w-5 mb-1.5 opacity-40" />
                    <span className="text-[10px]">No podcasts found</span>
                  </div>
                ) : (
                  filteredPodcasts.map((p) => {
                    const sel = selections.find((s) => s.podcastId === p.id);
                    const isSelected = !!sel;

                    return (
                      <div key={p.id} className="space-y-0">
                        {/* Podcast row */}
                        <button
                          onClick={() => togglePodcast(p.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors text-left",
                            isSelected
                              ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20"
                              : "hover:bg-white/[0.03] border border-transparent"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="data-[state=checked]:bg-[#3B82F6] data-[state=checked]:border-[#3B82F6]"
                            tabIndex={-1}
                          />
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="h-7 w-7 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded bg-white/5 shrink-0" />
                          )}
                          <span className="text-xs text-[#F9FAFB] truncate flex-1">{p.title}</span>
                          {isSelected && (
                            <span className="text-[9px] text-[#9CA3AF] shrink-0">
                              {sel.useLatest ? "Latest" : sel.episodeId ? "Picked" : "Pick..."}
                            </span>
                          )}
                        </button>

                        {/* Episode selection panel (shown when podcast is selected) */}
                        {isSelected && sel && (
                          <div className="ml-10 mr-2 mb-1 rounded-md bg-[#0A1628] border border-white/5 p-2 space-y-2">
                            {/* Duration tier selector */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#9CA3AF] w-20">Duration tier:</span>
                              <div className="flex items-center gap-1">
                                {DURATION_TIERS.map((t) => (
                                  <button
                                    key={t}
                                    onClick={(e) => { e.stopPropagation(); setDurationTier(p.id, t); }}
                                    className={cn(
                                      "rounded px-2 py-0.5 text-[10px] font-mono tabular-nums transition-colors",
                                      sel.durationTier === t
                                        ? "bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30"
                                        : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-transparent"
                                    )}
                                  >
                                    {t}m
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Latest toggle */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLatest(p.id); }}
                              className="flex items-center gap-2 w-full text-left"
                            >
                              {sel.useLatest ? (
                                <ToggleRight className="h-4 w-4 text-[#3B82F6]" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-[#9CA3AF]" />
                              )}
                              <span className="text-[10px] text-[#F9FAFB]">Use latest episode</span>
                            </button>

                            {/* Episode picker (when not using latest) */}
                            {!sel.useLatest && (
                              <EpisodePicker
                                podcastId={p.id}
                                selectedEpisodeId={sel.episodeId}
                                onSelect={(eid) => setEpisode(p.id, eid)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Validation warning */}
          {invalidCount > 0 && (
            <div className="text-[10px] text-[#F97316] flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              {invalidCount} podcast{invalidCount > 1 ? "s" : ""} need{invalidCount === 1 ? "s" : ""} an episode selected
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || selections.length === 0 || invalidCount > 0}
            className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {submitting ? "Creating..." : "Create Test Briefing"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading Skeleton ──

function RequestsSkeleton() {
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-60 bg-white/5 rounded" />
        <Skeleton className="h-8 w-32 bg-white/5 rounded" />
      </div>
      <div className="flex-1 bg-[#1A2942] border border-white/5 rounded-lg">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-3 py-3 border-b border-white/5">
            <Skeleton className="h-5 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──

export default function Requests() {
  const apiFetch = useAdminFetch();
  const [searchParams] = useSearchParams();

  const [requests, setRequests] = useState<BriefingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<BriefingRequestStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, BriefingRequest>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  // Deep-link state
  const deepLinkRequestId = searchParams.get("requestId");
  const deepLinkJobId = searchParams.get("jobId");
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const jobScrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    apiFetch<{ data: BriefingRequest[]; total: number }>(`/requests?${params}`)
      .then((r) => {
        setRequests(r.data);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [apiFetch, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => {
    load(true);
    if (expandedId) {
      apiFetch<{ data: BriefingRequest }>(`/requests/${expandedId}`)
        .then((r) => setDetailCache((prev) => ({ ...prev, [expandedId]: r.data })))
        .catch(console.error);
    }
  }, 5_000);

  // Deep-link: fetch the target request directly (avoids pagination miss) and auto-expand
  useEffect(() => {
    if (!deepLinkRequestId || deepLinkHandled) return;
    setDeepLinkHandled(true);
    apiFetch<{ data: BriefingRequest }>(`/requests/${deepLinkRequestId}`)
      .then((r) => {
        const detail = r.data;
        // Inject into list if not present
        setRequests((prev) =>
          prev.some((req) => req.id === detail.id)
            ? prev
            : [detail, ...prev]
        );
        setDetailCache((prev) => ({ ...prev, [detail.id]: detail }));
        setExpandedId(detail.id);
      })
      .catch(console.error);
  }, [deepLinkRequestId, deepLinkHandled, apiFetch]);

  // Scroll to the highlighted job once the detail is loaded and rendered
  useEffect(() => {
    if (!deepLinkJobId || !deepLinkRequestId) return;
    const detail = detailCache[deepLinkRequestId];
    if (!detail?.jobProgress) return;
    // Wait a tick for DOM to render the expanded content
    const timer = setTimeout(() => {
      jobScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [deepLinkJobId, deepLinkRequestId, detailCache]);

  const toggleRow = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (!detailCache[id]) {
        setDetailLoading(true);
        apiFetch<{ data: BriefingRequest }>(`/requests/${id}`)
          .then((r) => {
            setDetailCache((prev) => ({ ...prev, [id]: r.data }));
          })
          .catch(console.error)
          .finally(() => setDetailLoading(false));
      }
    },
    [expandedId, detailCache, apiFetch]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && requests.length === 0) return <RequestsSkeleton />;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Requests</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {total} total
          </Badge>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Live
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={() => { setRefreshing(true); load(); }}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            onClick={() => setTestDialogOpen(true)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Test Briefing
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
              statusFilter === tab.value
                ? "bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30"
                : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-transparent"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 bg-[#1A2942] border border-white/5 rounded-lg flex flex-col min-h-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[24px_100px_1fr_80px_60px_80px_80px_100px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF] border-b border-white/5 bg-[#0F1D32]">
          <span />
          <span>Status</span>
          <span>User</span>
          <span>Duration</span>
          <span>Items</span>
          <span>Type</span>
          <span>Cost</span>
          <span>Created</span>
        </div>

        {/* Rows */}
        <ScrollArea className="flex-1">
          {requests.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
              <Inbox className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No requests found</span>
            </div>
          ) : (
            requests.map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                expanded={expandedId === req.id}
                onToggle={() => toggleRow(req.id)}
                detail={detailCache[req.id] ?? null}
                detailLoading={detailLoading && expandedId === req.id && !detailCache[req.id]}
                highlightJobId={expandedId === req.id ? deepLinkJobId : null}
                jobRef={expandedId === req.id ? jobScrollRef : undefined}
              />
            ))
          )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-[#0F1D32]">
            <span className="text-[10px] text-[#9CA3AF]">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs h-7 px-2"
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs h-7 px-2"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Test Briefing Dialog */}
      <TestBriefingDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        onSuccess={load}
      />
    </div>
  );
}
