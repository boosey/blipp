import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Responsive, WidthProvider, type Layout, type ResponsiveLayouts } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
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
  Lock,
  Unlock,
  RotateCcw,
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

// ── Grid Layout Setup ──

const GridLayout = WidthProvider(Responsive);

const LAYOUT_KEY = "blipp-cc-layout";
const ROW_H = 50;
const MARGINS: [number, number] = [12, 12];
const COLS = { lg: 12, md: 10, sm: 6, xs: 1 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };

const DEFAULT_LO: ResponsiveLayouts = {
  lg: [
    { i: "system-health",     x: 0, y: 0,  w: 5, h: 5, minW: 3, minH: 3 },
    { i: "pipeline-pulse",    x: 0, y: 5,  w: 5, h: 8, minW: 3, minH: 4 },
    { i: "active-issues",     x: 5, y: 0,  w: 4, h: 9, minW: 3, minH: 4 },
    { i: "recent-activity",   x: 5, y: 9,  w: 4, h: 4, minW: 2, minH: 3 },
    { i: "feed-refresh",      x: 9, y: 0,  w: 3, h: 3, minW: 2, minH: 2 },
    { i: "pipeline-controls", x: 9, y: 3,  w: 3, h: 5, minW: 2, minH: 3 },
    { i: "cost-monitor",      x: 9, y: 8,  w: 3, h: 5, minW: 2, minH: 3 },
    { i: "quick-stats",       x: 9, y: 13, w: 3, h: 3, minW: 2, minH: 2 },
  ],
};

function getSavedLayouts(): ResponsiveLayouts {
  try {
    const s = localStorage.getItem(LAYOUT_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return DEFAULT_LO;
}

// ── Helpers ──

const STAGE_NAMES = ["Transcription", "Distillation", "Narrative Gen", "Audio Gen", "Assembly"];

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

function summarizeIssue(raw: string): { summary: string; rawJson: string | null } {
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

function humanizeType(type: string): string {
  return type.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

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

const STAGE_COLOR_MAP: Record<string, string> = {
  TRANSCRIPTION: "#8B5CF6",
  DISTILLATION: "#F59E0B",
  NARRATIVE_GENERATION: "#10B981",
  AUDIO_GENERATION: "#06B6D4",
  BRIEFING_ASSEMBLY: "#14B8A6",
};

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLOR_MAP[stage] ?? "#9CA3AF";
  return (
    <span
      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {Object.keys(STAGE_COLOR_MAP).indexOf(stage) + 1 || "?"}
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

function IssueCard({ issue, onRetry, onDismiss, onDoubleClick }: {
  issue: ActiveIssue;
  onRetry: (issue: ActiveIssue) => Promise<void>;
  onDismiss: (issue: ActiveIssue) => void;
  onDoubleClick?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const sc = severityColor(issue.severity);

  const { summary, rawDetails } = useMemo(() => {
    if (issue.rawError) {
      return { summary: issue.description, rawDetails: issue.rawError };
    }
    const { summary: s, rawJson } = summarizeIssue(issue.description);
    return { summary: s, rawDetails: rawJson };
  }, [issue.description, issue.rawError]);

  const title = useMemo(() => humanizeTitle(issue.title), [issue.title]);

  return (
    <div
      className={cn("rounded-md border p-3 space-y-2", sc.bg, sc.border, onDoubleClick && "cursor-pointer")}
      onDoubleClick={onDoubleClick}
    >
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
          <Button
            size="xs"
            variant="ghost"
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]"
            onClick={() => onDismiss(issue)}
          >
            <XCircle className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ──

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

// ── Dark theme overrides ──

const GRID_CSS = `
  .react-grid-item > .react-resizable-handle::after {
    border-right: 2px solid rgba(255, 255, 255, 0.15) !important;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15) !important;
  }
  .react-grid-placeholder {
    background: rgba(59, 130, 246, 0.1) !important;
    border: 1px dashed rgba(59, 130, 246, 0.3) !important;
    border-radius: 0.5rem;
  }
  .cc-edit .widget-drag-handle { cursor: grab; }
  .cc-edit .widget-drag-handle:active { cursor: grabbing; }
`;

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
  const [lo, setLo] = useState<ResponsiveLayouts>(getSavedLayouts);
  const [editing, setEditing] = useState(false);

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

  const handleIssueDismiss = useCallback(
    async (issue: ActiveIssue) => {
      const prev = issues;
      setIssues((cur) => cur.filter((i) => i.id !== issue.id));
      if (issue.jobId) {
        try {
          await apiFetch(`/pipeline/jobs/${issue.jobId}/dismiss`, { method: "PATCH" });
        } catch {
          setIssues(prev);
          toast.error("Failed to dismiss issue");
        }
      }
    },
    [apiFetch, issues]
  );

  const handleDismissAll = useCallback(async () => {
    const prev = issues;
    setIssues([]);
    try {
      await apiFetch("/pipeline/jobs/bulk-dismiss", { method: "PATCH" });
    } catch {
      setIssues(prev);
      toast.error("Failed to dismiss all issues");
    }
  }, [apiFetch, issues]);

  const navToJob = useCallback(
    (requestId?: string, jobId?: string) => {
      if (jobId && requestId) navigate(`/admin/requests?requestId=${requestId}&jobId=${jobId}`);
    },
    [navigate]
  );

  const onLoChange = useCallback((_cur: Layout, all: ResponsiveLayouts) => {
    setLo(all);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  }, []);

  const resetLo = useCallback(() => {
    setLo(DEFAULT_LO);
    localStorage.removeItem(LAYOUT_KEY);
  }, []);

  if (loading && !health) return <CommandCenterSkeleton />;

  return (
    <>
      <style>{GRID_CSS}</style>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <div>
          {editing && (
            <span className="text-xs text-[#9CA3AF]">
              Drag headers to rearrange, resize from corners
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={load} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {editing && (
            <Button variant="ghost" size="sm" onClick={resetLo} className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
          <Button
            variant={editing ? "default" : "ghost"}
            size="sm"
            onClick={() => setEditing(!editing)}
            className={cn(
              "text-xs gap-1",
              editing ? "bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white" : "text-[#9CA3AF] hover:text-[#F9FAFB]"
            )}
          >
            {editing ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {editing ? "Lock Layout" : "Customize"}
          </Button>
        </div>
      </div>

      <div className={editing ? "cc-edit" : ""}>
        <GridLayout
          layouts={lo}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_H}
          margin={MARGINS}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag-handle"
          draggableCancel="button, a, input, select, textarea"
          onLayoutChange={onLoChange}
          compactType="vertical"
        >
          {/* ── System Health ── */}
          <div key="system-health">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center justify-between mb-3 shrink-0">
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
              <div className="flex-1 min-h-0 overflow-auto space-y-1">
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
          </div>

          {/* ── Pipeline Pulse ── */}
          <div key="pipeline-pulse">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center justify-between p-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[#F59E0B]" />
                  <span className="text-sm font-semibold">Pipeline Pulse</span>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] text-[#10B981] font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
                  </span>
                  LIVE
                </span>
              </div>
              <ScrollArea className="flex-1 min-h-0 px-4 pb-3">
                <div className="space-y-0.5">
                  {events.map((evt) => (
                    <div
                      key={evt.id}
                      className={cn(
                        "flex items-center gap-2.5 py-1.5 px-2 rounded text-xs transition-colors hover:bg-white/[0.03]",
                        evt.status === "failed" && "border-l-2 border-[#EF4444] bg-[#EF4444]/[0.04]",
                        (evt.jobId && evt.requestId) && "cursor-pointer"
                      )}
                      onDoubleClick={() => navToJob(evt.requestId, evt.jobId)}
                    >
                      <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums w-12 shrink-0">
                        {relativeTime(evt.timestamp)}
                      </span>
                      <StageBadge stage={evt.stage} />
                      <div className="flex-1 min-w-0 truncate">
                        <span className="text-[#F9FAFB]">{evt.episodeTitle ?? evt.type}</span>
                        {evt.podcastName && <span className="text-[#9CA3AF] ml-1">- {evt.podcastName}</span>}
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

          {/* ── Active Issues ── */}
          <div key="active-issues">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center justify-between p-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
                  <span className="text-sm font-semibold">Active Issues</span>
                  {issues.length > 0 && (
                    <Badge className="bg-[#EF4444]/15 text-[#EF4444] text-[10px] ml-1">{issues.length}</Badge>
                  )}
                </div>
                {issues.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 text-xs gap-1"
                    onClick={handleDismissAll}
                  >
                    <XCircle className="h-3 w-3" /> Dismiss All
                  </Button>
                )}
              </div>
              <ScrollArea className="flex-1 min-h-0 px-4 pb-3">
                {issues.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                    <CheckCircle2 className="h-8 w-8 mb-2 text-[#10B981] opacity-60" />
                    <span className="text-sm font-medium text-[#10B981]">No active issues</span>
                    <span className="text-xs text-[#9CA3AF] mt-1">All systems running smoothly</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {issues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onRetry={handleIssueRetry}
                        onDismiss={handleIssueDismiss}
                        onDoubleClick={issue.jobId && issue.requestId ? () => navToJob(issue.requestId, issue.jobId) : undefined}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* ── Recent Activity ── */}
          <div key="recent-activity">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
                <CircleDot className="h-4 w-4 text-[#14B8A6]" />
                <span className="text-sm font-semibold">Recent Activity</span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
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
                         evt.type === "NARRATIVE_GENERATION" ? "Generated narrative" :
                         evt.type === "AUDIO_GENERATION" ? "Generated audio" :
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

          {/* ── Feed Refresh ── */}
          <div key="feed-refresh">
            <FeedRefreshCard className="h-full overflow-auto" />
          </div>

          {/* ── Pipeline Controls ── */}
          <div key="pipeline-controls">
            {pipeline.loading ? (
              <Skeleton className="h-full bg-white/5 rounded-lg" />
            ) : (
              <PipelineControls
                variant="full"
                className="h-full overflow-auto"
                config={pipeline.config}
                saving={pipeline.saving}
                onTogglePipeline={pipeline.togglePipeline}
                onToggleStage={pipeline.toggleStage}
              />
            )}
          </div>

          {/* ── Cost Monitor ── */}
          <div key="cost-monitor">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
                <DollarSign className="h-4 w-4 text-[#10B981]" />
                <span className="text-sm font-semibold">Cost Monitor</span>
              </div>
              {cost ? (
                <div className="flex-1 min-h-0 overflow-auto space-y-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Today&apos;s Spend</span>
                    <div className="text-3xl font-bold font-mono tabular-nums mt-0.5">{formatCurrency(cost.todaySpend)}</div>
                  </div>
                  <Sparkline data={cost.breakdown.map((b) => b.amount)} />
                  <div className="flex items-center gap-3">
                    <MiniPie breakdown={cost.breakdown} />
                    <div className="flex-1 space-y-1">
                      {cost.breakdown.map((b, i) => (
                        <div key={b.category} className="flex items-center gap-2 text-[10px]">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"][i % 4] }} />
                          <span className="text-[#9CA3AF] flex-1">{b.category}</span>
                          <span className="text-[#F9FAFB] font-mono tabular-nums">{formatCurrency(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator className="bg-white/5" />
                  <div className="flex items-center gap-1.5">
                    {cost.trend >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-[#EF4444]" /> : <TrendingDown className="h-3.5 w-3.5 text-[#10B981]" />}
                    <span className={cn("text-xs font-medium", cost.trend >= 0 ? "text-[#EF4444]" : "text-[#10B981]")}>
                      {cost.trend >= 0 ? "+" : ""}{cost.trend.toFixed(0)}% vs yesterday
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-[#9CA3AF]">Budget</span>
                      <span className="font-mono tabular-nums text-[#9CA3AF]">{cost.budgetUsed}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", cost.budgetUsed > 90 ? "bg-[#EF4444]" : cost.budgetUsed > 70 ? "bg-[#F59E0B]" : "bg-[#10B981]")}
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
          </div>

          {/* ── Quick Stats ── */}
          <div key="quick-stats">
            <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
              <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
                <Info className="h-4 w-4 text-[#3B82F6]" />
                <span className="text-sm font-semibold">Quick Stats</span>
              </div>
              {stats ? (
                <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
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
        </GridLayout>
      </div>
    </>
  );
}
