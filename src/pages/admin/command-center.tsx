import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  DollarSign,
  Library,
  Radio,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
  Disc3,
  Zap,
  Clock,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAdminFetch } from "@/lib/admin-api";
import { usePipelineConfig } from "@/hooks/use-pipeline-config";
import { PipelineControls } from "@/components/admin/pipeline-controls";
import { FeedRefreshCard } from "@/components/admin/feed-refresh-card";
import type {
  SystemHealth,
  DashboardStats,
  CostSummary,
  ActivityEvent,
  ActiveIssue,
} from "@/types/admin";

// ── Helpers ──

const STAGE_NAMES = ["Transcription", "Distillation", "Clip Gen", "Assembly"];
const STAGE_COLORS = ["#8B5CF6", "#F59E0B", "#10B981", "#14B8A6"];

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

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function statusColor(status: string) {
  switch (status) {
    case "completed": return "text-[#10B981]";
    case "failed": return "text-[#EF4444]";
    case "in_progress": return "text-[#F59E0B]";
    default: return "text-[#9CA3AF]";
  }
}

/** Try to extract a readable message from a parsed JSON object. */
function extractMessage(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  // Walk common error field names
  for (const key of ["message", "msg", "reason", "detail", "details", "statusText", "description"]) {
    if (typeof o[key] === "string" && (o[key] as string).length > 0) return o[key] as string;
  }
  // Nested error object
  if (o.error && typeof o.error === "object") return extractMessage(o.error);
  if (typeof o.error === "string" && o.error.length > 0) return o.error;
  return null;
}

/** Try to find and parse JSON anywhere in a string. */
function findJson(raw: string): unknown | null {
  // Direct parse
  try { return JSON.parse(raw); } catch { /* continue */ }
  // Find first { or [ and try from there
  for (const ch of ["{", "["]) {
    const idx = raw.indexOf(ch);
    if (idx >= 0) {
      try { return JSON.parse(raw.slice(idx)); } catch { /* continue */ }
    }
  }
  // Double-stringified: "\"{ ... }\""
  if (raw.includes('\\"') || raw.includes("\\{")) {
    try { return JSON.parse(JSON.parse(`"${raw}"`)); } catch { /* continue */ }
  }
  return null;
}

/** Extract a human-readable summary from an error description that may contain JSON. */
function summarizeIssue(raw: string): { summary: string; rawJson: string | null } {
  if (!raw || raw === "Unknown error") return { summary: raw, rawJson: null };

  const parsed = findJson(raw);
  if (parsed && typeof parsed === "object") {
    // Try to extract a readable message
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { summary: "Empty error array", rawJson: raw };
      const first = parsed[0];
      const firstMsg = typeof first === "string" ? first : extractMessage(first) ?? JSON.stringify(first);
      const suffix = parsed.length > 1 ? ` (+${parsed.length - 1} more)` : "";
      return { summary: `${firstMsg}${suffix}`, rawJson: raw };
    }
    const msg = extractMessage(parsed);
    if (msg) return { summary: msg, rawJson: raw };
    // Has JSON but no readable field
    return { summary: "Error occurred (see details)", rawJson: raw };
  }

  // Not JSON — but check if it looks technical / too long
  return { summary: raw, rawJson: null };
}

/** Turn SCREAMING_SNAKE_CASE into "Screaming snake case". */
function humanizeType(type: string): string {
  return type.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Make issue titles human-readable. "FEED_REFRESH job failed" → "Feed refresh job failed" */
function humanizeTitle(title: string): string {
  return title.replace(/^[A-Z_]+/, (match) => humanizeType(match));
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", border: "border-[#EF4444]/30" };
    case "warning": return { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]", border: "border-[#F59E0B]/30" };
    default: return { bg: "bg-[#3B82F6]/10", text: "text-[#3B82F6]", border: "border-[#3B82F6]/30" };
  }
}

// ── Sub-components ──

function HealthBar({ rate, color, label, onClick }: { rate: number; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-3 w-full text-left hover:bg-white/[0.03] -mx-1 px-1 py-1 rounded transition-colors">
      <span className="text-xs text-[#9CA3AF] w-24 truncate">{label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${rate}%`, backgroundColor: rate > 95 ? "#10B981" : rate > 80 ? "#F59E0B" : "#EF4444" }}
        />
      </div>
      <span className={cn(
        "text-xs font-mono w-10 text-right tabular-nums",
        rate > 95 ? "text-[#10B981]" : rate > 80 ? "text-[#F59E0B]" : "text-[#EF4444]"
      )}>
        {rate.toFixed(1)}%
      </span>
      <ChevronRight className="h-3 w-3 text-[#9CA3AF]/0 group-hover:text-[#9CA3AF]/60 transition-colors" />
    </button>
  );
}

const STAGE_COLOR_MAP: Record<number, string> = {
  1: "#3B82F6", // Feed refresh (legacy events)
  2: "#8B5CF6",
  3: "#F59E0B",
  4: "#10B981",
  5: "#14B8A6",
};

function StageBadge({ stage }: { stage: number }) {
  const color = STAGE_COLOR_MAP[stage] ?? "#9CA3AF";
  return (
    <span
      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {stage}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "completed" ? "#10B981" : status === "failed" ? "#EF4444" : status === "in_progress" ? "#F59E0B" : "#9CA3AF";
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "in_progress" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

function MiniPie({ breakdown }: { breakdown: CostSummary["breakdown"] }) {
  // Simple SVG pie chart
  const total = breakdown.reduce((s, b) => s + b.amount, 0);
  if (total === 0) return null;
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"];
  let cumulative = 0;

  function describeArc(startAngle: number, endAngle: number) {
    const start = polarToCartesian(20, 20, 18, endAngle);
    const end = polarToCartesian(20, 20, 18, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M 20 20 L ${start.x} ${start.y} A 18 18 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
  }

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      {breakdown.map((b, i) => {
        const angle = (b.amount / total) * 360;
        const startAngle = cumulative;
        cumulative += angle;
        if (angle < 0.5) return null;
        return (
          <path
            key={i}
            d={describeArc(startAngle, startAngle + angle)}
            fill={colors[i % colors.length]}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

function Sparkline({ data, width = 100, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function QuickStatCard({ label, value, trend, icon: Icon, color }: {
  label: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  color: string;
}) {
  const up = trend >= 0;
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <span className="text-xl font-bold tabular-nums font-mono">{formatNumber(value)}</span>
      <div className="flex items-center gap-1">
        {up ? <TrendingUp className="h-3 w-3 text-[#10B981]" /> : <TrendingDown className="h-3 w-3 text-[#EF4444]" />}
        <span className={cn("text-[10px] font-medium tabular-nums", up ? "text-[#10B981]" : "text-[#EF4444]")}>
          {up ? "+" : ""}{trend.toFixed(1)}%
        </span>
        <span className="text-[10px] text-[#9CA3AF]">vs yesterday</span>
      </div>
    </div>
  );
}

function IssueCard({ issue, onRetry }: { issue: ActiveIssue; onRetry: (issue: ActiveIssue) => Promise<void> }) {
  const [showDetails, setShowDetails] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const sc = severityColor(issue.severity);

  // Backend now sends pre-parsed description + rawError.
  // Fallback: if backend hasn't been updated yet, parse on client side.
  const { summary, rawDetails } = useMemo(() => {
    if (issue.rawError) {
      return { summary: issue.description, rawDetails: issue.rawError };
    }
    const { summary: s, rawJson } = summarizeIssue(issue.description);
    return { summary: s, rawDetails: rawJson };
  }, [issue.description, issue.rawError]);

  const title = useMemo(() => humanizeTitle(issue.title), [issue.title]);

  return (
    <div className={cn("rounded-md border p-3 space-y-2", sc.bg, sc.border)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge className={cn("text-[10px] uppercase font-bold shrink-0", sc.bg, sc.text)}>
            {issue.severity}
          </Badge>
          <span className="text-xs font-medium truncate">{title}</span>
        </div>
        <span className="text-[10px] text-[#9CA3AF] font-mono shrink-0">
          {relativeTime(issue.createdAt)}
        </span>
      </div>
      <p className="text-[11px] text-[#9CA3AF] leading-relaxed line-clamp-3">{summary}</p>
      {rawDetails && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showDetails && "rotate-180")} />
          {showDetails ? "Hide" : "Show"} raw details
        </button>
      )}
      {showDetails && rawDetails && (
        <pre className="text-[10px] text-[#9CA3AF]/70 bg-black/20 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap break-all">
          {(() => {
            try {
              return JSON.stringify(JSON.parse(rawDetails), null, 2);
            } catch {
              return rawDetails;
            }
          })()}
        </pre>
      )}
      {issue.actionable && (
        <div className="flex gap-2">
          <Button
            size="xs"
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-[10px]"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetry(issue);
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {retrying ? "Retrying..." : "Retry"}
          </Button>
          <Button size="xs" variant="ghost" className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]">
            <XCircle className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Loading skeletons ──

function CommandCenterSkeleton() {
  return (
    <div className="grid grid-cols-[5fr_3fr_2fr] gap-4 h-full">
      <div className="space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-96 bg-white/5 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 bg-white/5 rounded-lg" />
        <Skeleton className="h-80 bg-white/5 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-52 bg-white/5 rounded-lg" />
        <Skeleton className="h-40 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main ──

export default function CommandCenter() {
  const navigate = useNavigate();
  const apiFetch = useAdminFetch();
  const pipeline = usePipelineConfig();

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [issues, setIssues] = useState<ActiveIssue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ data: SystemHealth }>("/dashboard").then((r) => setHealth(r.data)).catch(console.error),
      apiFetch<{ data: DashboardStats }>("/dashboard/stats").then((r) => setStats(r.data)).catch(console.error),
      apiFetch<{ data: CostSummary }>("/dashboard/costs").then((r) => setCost(r.data)).catch(console.error),
      apiFetch<{ data: ActivityEvent[] }>("/dashboard/activity").then((r) => setEvents(r.data)).catch(console.error),
      apiFetch<{ data: ActiveIssue[] }>("/dashboard/issues").then((r) => setIssues(r.data)).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleIssueRetry = useCallback(
    async (issue: ActiveIssue) => {
      try {
        if (issue.entityType === "episode" && issue.entityId) {
          await apiFetch(`/pipeline/trigger/episode/${issue.entityId}`, { method: "POST" });
        } else if (issue.entityType === "podcast" && issue.entityId) {
          await apiFetch(`/podcasts/${issue.entityId}/refresh`, { method: "POST" });
        } else {
          await apiFetch("/pipeline/trigger/feed-refresh", { method: "POST" });
        }
        load();
      } catch (e) {
        console.error("Issue retry failed:", e);
      }
    },
    [apiFetch, load]
  );

  if (loading && !health) return <CommandCenterSkeleton />;

  return (
    <div className="grid grid-cols-[4fr_3fr_2.5fr] gap-4 h-[calc(100vh-7rem)]">
      {/* ── LEFT COLUMN ── */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* System Health Panel */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#3B82F6]" />
              <span className="text-sm font-semibold">System Health</span>
            </div>
            <Badge
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold",
                health?.overall === "operational"
                  ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/20"
                  : health?.overall === "degraded"
                  ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/20"
                  : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/20"
              )}
            >
              {health?.overall === "operational"
                ? "All Systems Operational"
                : health?.overall === "degraded"
                ? "Degraded Performance"
                : `${health?.activeIssuesCount ?? 0} Issues`}
            </Badge>
          </div>
          <div className="space-y-1">
            {health?.stages.map((s) => (
              <HealthBar
                key={s.stage}
                rate={s.completionRate}
                color={STAGE_COLOR_MAP[s.stage] ?? "#9CA3AF"}
                label={s.name}
                onClick={() => navigate(`/admin/pipeline?stage=${s.stage}`)}
              />
            ))}
            {!health && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 bg-white/5 rounded" />
            ))}
          </div>
        </div>

        {/* Pipeline Pulse */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-sm font-semibold">Pipeline Pulse</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-[#10B981] font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
                </span>
                LIVE
              </span>
              <Button variant="ghost" size="icon-xs" onClick={load} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 pb-3">
            <div className="space-y-0.5">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className={cn(
                    "flex items-center gap-2.5 py-1.5 px-2 rounded text-xs transition-colors hover:bg-white/[0.03]",
                    evt.status === "failed" && "border-l-2 border-[#EF4444] bg-[#EF4444]/[0.04]"
                  )}
                >
                  <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-12 shrink-0">
                    {relativeTime(evt.timestamp)}
                  </span>
                  <StageBadge stage={evt.stage} />
                  <div className="flex-1 min-w-0 truncate">
                    <span className="text-[#F9FAFB]">{evt.episodeTitle ?? evt.type}</span>
                    {evt.podcastName && (
                      <span className="text-[#9CA3AF] ml-1">- {evt.podcastName}</span>
                    )}
                  </div>
                  <StatusDot status={evt.status} />
                  {evt.processingTime != null && (
                    <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-10 text-right">
                      {evt.processingTime < 1000 ? `${evt.processingTime}ms` : `${(evt.processingTime / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              ))}
              {events.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
                  <Clock className="h-6 w-6 mb-2 opacity-40" />
                  <span className="text-xs">No recent activity</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── CENTER COLUMN ── */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Active Issues */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
              <span className="text-sm font-semibold">Active Issues</span>
              {issues.length > 0 && (
                <Badge className="bg-[#EF4444]/15 text-[#EF4444] text-[10px] ml-1">{issues.length}</Badge>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 px-4 pb-3">
            {issues.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <CheckCircle2 className="h-8 w-8 mb-2 text-[#10B981] opacity-60" />
                <span className="text-sm font-medium text-[#10B981]">No active issues</span>
                <span className="text-xs text-[#9CA3AF] mt-1">All systems running smoothly</span>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onRetry={handleIssueRetry} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 max-h-64">
          <div className="flex items-center gap-2 mb-3">
            <CircleDot className="h-4 w-4 text-[#14B8A6]" />
            <span className="text-sm font-semibold">Recent Activity</span>
          </div>
          <ScrollArea className="h-40">
            <div className="space-y-2">
              {events.slice(0, 8).map((evt) => (
                <div key={`ra-${evt.id}`} className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-12 shrink-0">
                    {relativeTime(evt.timestamp)}
                  </span>
                  <StatusDot status={evt.status} />
                  <span className="truncate flex-1 text-[#F9FAFB]/80">
                    {evt.type === "FEED_REFRESH" ? "Refreshed feed" :
                     evt.type === "TRANSCRIPTION" ? "Transcribed" :
                     evt.type === "DISTILLATION" ? "Distilled" :
                     evt.type === "CLIP_GENERATION" ? "Generated clips" :
                     "Assembled briefing"}
                    {evt.episodeTitle && <span className="text-[#9CA3AF]"> - {evt.episodeTitle}</span>}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Feed Refresh Summary */}
        <FeedRefreshCard />

        {/* Pipeline Controls */}
        {pipeline.loading ? (
          <Skeleton className="h-48 bg-white/5 rounded-lg" />
        ) : (
          <PipelineControls
            variant="full"
            config={pipeline.config}
            saving={pipeline.saving}
            triggering={pipeline.triggering}
            onTogglePipeline={pipeline.togglePipeline}
            onToggleStage={pipeline.toggleStage}
            onTriggerFeedRefresh={pipeline.triggerFeedRefresh}
          />
        )}

        {/* Cost Monitor */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-[#10B981]" />
            <span className="text-sm font-semibold">Cost Monitor</span>
          </div>

          {cost ? (
            <div className="space-y-3">
              {/* Today's spend */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Today&apos;s Spend</span>
                <div className="text-3xl font-bold font-mono tabular-nums mt-0.5">
                  {formatCurrency(cost.todaySpend)}
                </div>
              </div>

              {/* Sparkline */}
              <Sparkline data={cost.breakdown.map((b) => b.amount)} />

              {/* Breakdown with pie */}
              <div className="flex items-center gap-3">
                <MiniPie breakdown={cost.breakdown} />
                <div className="flex-1 space-y-1">
                  {cost.breakdown.map((b, i) => (
                    <div key={b.category} className="flex items-center gap-2 text-[10px]">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"][i % 4] }}
                      />
                      <span className="text-[#9CA3AF] flex-1">{b.category}</span>
                      <span className="text-[#F9FAFB] font-mono tabular-nums">{formatCurrency(b.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Comparison */}
              <div className="flex items-center gap-1.5">
                {cost.trend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-[#EF4444]" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-[#10B981]" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  cost.trend >= 0 ? "text-[#EF4444]" : "text-[#10B981]"
                )}>
                  {cost.trend >= 0 ? "+" : ""}{cost.trend.toFixed(0)}% vs yesterday
                </span>
              </div>

              {/* Budget bar */}
              <div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#9CA3AF]">Budget</span>
                  <span className="font-mono tabular-nums text-[#9CA3AF]">{cost.budgetUsed}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      cost.budgetUsed > 90 ? "bg-[#EF4444]" : cost.budgetUsed > 70 ? "bg-[#F59E0B]" : "bg-[#10B981]"
                    )}
                    style={{ width: `${Math.min(cost.budgetUsed, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-10 w-24 bg-white/5" />
              <Skeleton className="h-7 w-full bg-white/5" />
              <Skeleton className="h-16 w-full bg-white/5" />
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-4 w-4 text-[#3B82F6]" />
            <span className="text-sm font-semibold">Quick Stats</span>
          </div>
          {stats ? (
            <div className="grid grid-cols-2 gap-2">
              <QuickStatCard label="Podcasts" value={stats.podcasts.total} trend={stats.podcasts.trend} icon={Library} color="#3B82F6" />
              <QuickStatCard label="Users" value={stats.users.total} trend={stats.users.trend} icon={Users} color="#14B8A6" />
              <QuickStatCard label="Episodes" value={stats.episodes.total} trend={stats.episodes.trend} icon={Disc3} color="#8B5CF6" />
              <QuickStatCard label="Briefings" value={stats.briefings.total} trend={stats.briefings.trend} icon={Radio} color="#F59E0B" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
