import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ExternalLink,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  Loader2,
  FileJson,
  Play,
  Disc3,
  Timer,
  ChevronRight,
  AlertTriangle,
  Rss,
  Scissors,
  RefreshCw,
  Link2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminEpisode,
  EpisodePipelineStatus,
  EpisodePipelineTrace,
  EpisodeStageTrace,
  PipelineJobStatus,
} from "@/types/admin";

// ── Constants ──

const STAGE_META = [
  { stage: 1, name: "Feed Refresh", color: "#3B82F6" },
  { stage: 2, name: "Transcription", color: "#8B5CF6" },
  { stage: 3, name: "Distillation", color: "#F59E0B" },
  { stage: 4, name: "Clip Generation", color: "#10B981" },
  { stage: 5, name: "Briefing Assembly", color: "#14B8A6" },
];

const PIPELINE_STATUS_CONFIG: Record<EpisodePipelineStatus, { label: string; color: string; stageIdx: number }> = {
  pending: { label: "Pending", color: "#9CA3AF", stageIdx: 0 },
  transcribing: { label: "Transcribing", color: "#8B5CF6", stageIdx: 1 },
  distilling: { label: "Distilling", color: "#F59E0B", stageIdx: 2 },
  generating_clips: { label: "Generating Clips", color: "#10B981", stageIdx: 3 },
  completed: { label: "Completed", color: "#10B981", stageIdx: 5 },
  failed: { label: "Failed", color: "#EF4444", stageIdx: -1 },
};

// ── Helpers ──

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMs(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(c: number | undefined): string {
  if (c == null) return "-";
  return `$${c.toFixed(4)}`;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Pipeline Progress Dots ──

function PipelineDotsIndicator({ status }: { status: EpisodePipelineStatus }) {
  const cfg = PIPELINE_STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-0.5">
      {STAGE_META.map((s) => {
        const filled = status === "completed" || (status !== "failed" && s.stage <= cfg.stageIdx);
        const active = status !== "completed" && status !== "failed" && s.stage === cfg.stageIdx + 1;
        const failed = status === "failed";
        return (
          <span
            key={s.stage}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              filled ? "" : active ? "animate-pulse" : ""
            )}
            style={{
              backgroundColor: filled
                ? s.color
                : active
                ? `${s.color}80`
                : failed
                ? "#EF444440"
                : "rgba(255,255,255,0.08)",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Status Badge ──

function PipelineStatusBadge({ status }: { status: EpisodePipelineStatus }) {
  const cfg = PIPELINE_STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      {status === "completed" && <CheckCircle2 className="h-3 w-3" />}
      {status === "failed" && <XCircle className="h-3 w-3" />}
      {!["completed", "failed", "pending"].includes(status) && <Loader2 className="h-3 w-3 animate-spin" />}
      {cfg.label}
    </span>
  );
}

// ── Border color by status ──

function statusBorderColor(status: EpisodePipelineStatus): string {
  switch (status) {
    case "completed": return "#10B981";
    case "failed": return "#EF4444";
    case "pending": return "#9CA3AF40";
    default: return "#F59E0B";
  }
}

// ── Episode Row ──

function EpisodeRow({
  episode,
  selected,
  onClick,
}: {
  episode: AdminEpisode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center h-12 px-3 gap-3 transition-colors text-xs border-l-2",
        selected ? "bg-[#3B82F6]/5 border-l-[#3B82F6]" : "hover:bg-white/[0.03] even:bg-[#1A2942]"
      )}
      style={!selected ? { borderLeftColor: statusBorderColor(episode.pipelineStatus) } : undefined}
    >
      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="block truncate font-medium text-[11px]">{episode.title}</span>
      </div>

      {/* Podcast */}
      <div className="w-36 flex items-center gap-1.5 shrink-0 hidden xl:flex">
        {episode.podcastImageUrl ? (
          <img src={episode.podcastImageUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
        ) : (
          <div className="h-5 w-5 rounded bg-white/5 flex items-center justify-center shrink-0">
            <Rss className="h-3 w-3 text-[#9CA3AF]/40" />
          </div>
        )}
        <span className="text-[10px] text-[#9CA3AF] truncate">{episode.podcastTitle}</span>
      </div>

      {/* Date */}
      <span className="w-20 text-[10px] text-[#9CA3AF] text-right shrink-0 hidden lg:block">
        {formatDate(episode.publishedAt)}
      </span>

      {/* Duration */}
      <span className="w-12 text-[10px] text-[#9CA3AF] text-right font-mono tabular-nums shrink-0">
        {formatDuration(episode.durationSeconds)}
      </span>

      {/* Pipeline dots */}
      <div className="w-20 flex justify-center shrink-0">
        <PipelineDotsIndicator status={episode.pipelineStatus} />
      </div>

      {/* Clips */}
      <span className="w-10 text-[10px] text-[#9CA3AF] text-right font-mono tabular-nums shrink-0">
        {episode.clipCount}
      </span>

      {/* Cost */}
      <span className="w-14 text-[10px] text-[#9CA3AF] text-right font-mono tabular-nums shrink-0">
        {formatCost(episode.cost)}
      </span>

      {/* Arrow */}
      <ChevronRight className="h-3 w-3 text-[#9CA3AF]/30 shrink-0" />
    </button>
  );
}

// ── Detail Panel: Pipeline Trace ──

function PipelineTraceView({ trace }: { trace: EpisodePipelineTrace | null }) {
  if (!trace) return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 bg-white/5 rounded" />
      ))}
    </div>
  );

  return (
    <div className="p-4">
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/10" />

        <div className="space-y-4">
          {trace.stages.map((stage) => {
            const meta = STAGE_META[(stage.stage - 1) % 5];
            const isComplete = stage.status === "completed";
            const isFailed = stage.status === "failed";
            const isActive = stage.status === "in_progress";
            const nodeColor = isComplete ? meta.color : isFailed ? "#EF4444" : isActive ? meta.color : "#9CA3AF40";

            return (
              <div key={stage.stage} className="relative flex gap-3">
                {/* Node */}
                <span
                  className={cn(
                    "absolute -left-6 top-0.5 flex items-center justify-center h-[18px] w-[18px] rounded-full border-2",
                    isComplete && "border-transparent"
                  )}
                  style={{
                    borderColor: isComplete ? "transparent" : nodeColor,
                    backgroundColor: isComplete ? nodeColor : "transparent",
                  }}
                >
                  {isComplete && <CheckCircle2 className="h-3 w-3 text-white" />}
                  {isFailed && <XCircle className="h-3 w-3" style={{ color: nodeColor }} />}
                  {isActive && <Loader2 className="h-3 w-3 animate-spin" style={{ color: nodeColor }} />}
                </span>

                <div className="flex-1 min-w-0 rounded-md bg-white/[0.03] border border-white/5 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
                      >
                        {stage.stage}
                      </span>
                      <span className="text-[11px] font-medium">{stage.name}</span>
                    </div>
                    <PipelineStatusBadgeSmall status={stage.status} />
                  </div>

                  {(stage.startedAt || stage.durationMs != null || stage.cost != null) && (
                    <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF] mt-1.5">
                      {stage.startedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(stage.startedAt)}
                        </span>
                      )}
                      {stage.completedAt && stage.startedAt && (
                        <span className="text-[#9CA3AF]/50">→</span>
                      )}
                      {stage.completedAt && (
                        <span>{relativeTime(stage.completedAt)}</span>
                      )}
                      {stage.durationMs != null && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatMs(stage.durationMs)}
                        </span>
                      )}
                      {stage.cost != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatCost(stage.cost)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PipelineStatusBadgeSmall({ status }: { status: EpisodeStageTrace["status"] }) {
  const map: Record<string, { color: string; label: string }> = {
    completed: { color: "#10B981", label: "Done" },
    in_progress: { color: "#F59E0B", label: "Running" },
    pending: { color: "#9CA3AF", label: "Queued" },
    failed: { color: "#EF4444", label: "Failed" },
    skipped: { color: "#9CA3AF", label: "Skipped" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Detail Panel: Clips ──

interface Clip {
  id: string;
  durationTier: string;
  durationSeconds: number;
  status: string;
  audioUrl?: string;
  cached: boolean;
}

function ClipsView({ clips }: { clips: Clip[] }) {
  if (clips.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
      <Scissors className="h-6 w-6 mb-2 opacity-40" />
      <span className="text-xs">No clips generated</span>
    </div>
  );

  return (
    <div className="divide-y divide-white/5">
      {clips.map((clip) => (
        <div key={clip.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
          {clip.audioUrl && clip.status === "COMPLETED" ? (
            <Button variant="ghost" size="icon-xs" className="text-[#3B82F6] shrink-0">
              <Play className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="h-6 w-6 flex items-center justify-center shrink-0">
              <Disc3 className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge className="bg-[#8B5CF6]/15 text-[#8B5CF6] text-[9px]">{clip.durationTier}</Badge>
              <span className="text-[10px] text-[#9CA3AF] font-mono">{formatDuration(clip.durationSeconds)}</span>
            </div>
          </div>
          <span
            className="text-[10px] font-medium"
            style={{
              color: clip.status === "COMPLETED" ? "#10B981" : clip.status === "FAILED" ? "#EF4444" : "#F59E0B",
            }}
          >
            {clip.status.toLowerCase()}
          </span>
          {clip.cached && (
            <Badge className="bg-[#3B82F6]/10 text-[#3B82F6] text-[9px]">cached</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Detail Panel ──

function EpisodeDetailPanel({
  episode,
  onClose,
}: {
  episode: AdminEpisode | null;
  onClose: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [trace, setTrace] = useState<EpisodePipelineTrace | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  useEffect(() => {
    if (!episode) return;
    setTraceLoading(true);
    setTrace(null);
    setClips([]);
    apiFetch<{ data: { pipelineTrace: EpisodePipelineTrace; clips: Clip[] } }>(`/episodes/${episode.id}`)
      .then((r) => {
        setTrace(r.data.pipelineTrace);
        setClips(r.data.clips ?? []);
      })
      .catch(console.error)
      .finally(() => setTraceLoading(false));
  }, [episode, apiFetch]);

  if (!episode) return null;

  return (
    <div className="w-[40%] shrink-0 rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden min-w-[360px]">
      <Tabs defaultValue="overview" className="flex flex-col h-full">
        <TabsList variant="line" className="px-4 border-b border-white/5 bg-transparent shrink-0">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          <TabsTrigger value="trace" className="text-[11px]">Pipeline Trace</TabsTrigger>
          <TabsTrigger value="clips" className="text-[11px]">Clips</TabsTrigger>
          <TabsTrigger value="logs" className="text-[11px]">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-auto">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              {episode.podcastImageUrl ? (
                <img src={episode.podcastImageUrl} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <Disc3 className="h-6 w-6 text-[#9CA3AF]/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-tight">{episode.title}</h3>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{episode.podcastTitle}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <PipelineStatusBadge status={episode.pipelineStatus} />
                  <PipelineDotsIndicator status={episode.pipelineStatus} />
                </div>
              </div>
            </div>

            {/* Quick stats grid */}
            <div className="grid grid-cols-3 gap-px bg-white/5 rounded-lg overflow-hidden">
              {[
                { label: "Published", value: formatDate(episode.publishedAt), icon: Calendar },
                { label: "Duration", value: formatDuration(episode.durationSeconds), icon: Timer },
                { label: "Clips", value: String(episode.clipCount), icon: Scissors },
                { label: "Cost", value: formatCost(episode.cost), icon: DollarSign },
                { label: "Created", value: relativeTime(episode.createdAt), icon: Clock },
                { label: "Updated", value: relativeTime(episode.updatedAt), icon: RefreshCw },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-[#1A2942] p-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Icon className="h-3 w-3 text-[#9CA3AF]/60" />
                      <span className="text-[10px] text-[#9CA3AF]">{s.label}</span>
                    </div>
                    <div className="text-[11px] font-medium font-mono tabular-nums">{s.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Links */}
            {episode.transcriptUrl && (
              <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
                <Link2 className="h-3 w-3 text-[#3B82F6]" />
                <span className="text-[10px] text-[#3B82F6] truncate flex-1 font-mono">{episode.transcriptUrl}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => window.open(episode.transcriptUrl!, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}

            {episode.audioUrl && (
              <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
                <Play className="h-3 w-3 text-[#10B981]" />
                <span className="text-[10px] text-[#9CA3AF] truncate flex-1 font-mono">{episode.audioUrl}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => window.open(episode.audioUrl, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}

            {episode.description && (
              <div>
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-medium">Description</span>
                <p className="text-[11px] text-[#9CA3AF]/80 leading-relaxed mt-1 line-clamp-4">{episode.description}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="trace" className="flex-1 overflow-auto">
          {traceLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 bg-white/5 rounded" />
              ))}
            </div>
          ) : (
            <PipelineTraceView trace={trace} />
          )}
        </TabsContent>

        <TabsContent value="clips" className="flex-1 overflow-auto">
          <ClipsView clips={clips} />
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-auto p-4">
          <div className="space-y-3">
            {trace?.stages.filter((s) => s.output != null).map((stage) => (
              <div key={stage.stage}>
                <div className="flex items-center gap-1.5 mb-1">
                  <FileJson className="h-3 w-3" style={{ color: STAGE_META[(stage.stage - 1) % 5].color }} />
                  <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase">{stage.name}</span>
                </div>
                <pre className="rounded-md bg-[#0A1628] border border-white/5 p-2 text-[10px] font-mono text-[#9CA3AF] overflow-auto max-h-40 whitespace-pre-wrap break-all">
                  {JSON.stringify(stage.output, null, 2)}
                </pre>
              </div>
            ))}
            {(!trace || trace.stages.every((s) => s.output == null)) && (
              <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
                <FileJson className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No log data available</span>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Loading ──

function EpisodesSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 bg-white/5 rounded" />
        ))}
      </div>
      <Skeleton className="w-[40%] min-w-[360px] h-full bg-white/5 rounded-lg" />
    </div>
  );
}

// ── Main ──

export default function Episodes() {
  const apiFetch = useAdminFetch();

  const [episodes, setEpisodes] = useState<AdminEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState<AdminEpisode | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [podcastFilter, setPodcastFilter] = useState<string>("all");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (podcastFilter !== "all") params.set("podcastId", podcastFilter);
    params.set("limit", "50");

    apiFetch<{ data: AdminEpisode[] }>(`/episodes?${params}`)
      .then((r) => setEpisodes(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, search, statusFilter, podcastFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && episodes.length === 0) return <EpisodesSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Episode Table (60%) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[#9CA3AF]" />
            <Input
              placeholder="Search episodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs bg-white/5 border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-7 text-[10px] bg-white/5 border-white/10 text-[#9CA3AF]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="pending" className="text-xs">Pending</SelectItem>
              <SelectItem value="transcribing" className="text-xs">Transcribing</SelectItem>
              <SelectItem value="distilling" className="text-xs">Distilling</SelectItem>
              <SelectItem value="generating_clips" className="text-xs">Generating Clips</SelectItem>
              <SelectItem value="completed" className="text-xs">Completed</SelectItem>
              <SelectItem value="failed" className="text-xs">Failed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-[#9CA3AF] font-mono ml-auto">{episodes.length} episodes</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={load}
            className="text-[#9CA3AF] hover:text-[#F9FAFB]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg bg-[#1A2942] border border-white/5 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center h-8 px-3 gap-3 border-b border-white/5 bg-white/[0.02] text-[10px] text-[#9CA3AF] uppercase tracking-wider font-medium shrink-0">
            <span className="flex-1">Title</span>
            <span className="w-36 hidden xl:block">Podcast</span>
            <span className="w-20 text-right hidden lg:block">Published</span>
            <span className="w-12 text-right">Dur</span>
            <span className="w-20 text-center">Pipeline</span>
            <span className="w-10 text-right">Clips</span>
            <span className="w-14 text-right">Cost</span>
            <span className="w-3" />
          </div>

          <ScrollArea className="flex-1">
            {episodes.map((ep) => (
              <EpisodeRow
                key={ep.id}
                episode={ep}
                selected={selectedEp?.id === ep.id}
                onClick={() => setSelectedEp(selectedEp?.id === ep.id ? null : ep)}
              />
            ))}
            {episodes.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
                <Disc3 className="h-8 w-8 mb-2 opacity-40" />
                <span className="text-sm">No episodes found</span>
                <span className="text-xs mt-1">Try adjusting your filters</span>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Detail Panel (40%) */}
      {selectedEp && (
        <EpisodeDetailPanel episode={selectedEp} onClose={() => setSelectedEp(null)} />
      )}
    </div>
  );
}
