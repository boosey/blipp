import { useState, useEffect, useCallback } from "react";
import {
  Rss,
  Mic,
  Sparkles,
  Scissors,
  Package,
  ArrowRight,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  FileJson,
  Timer,
  Pause,
  Play,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/admin-api";
import { usePipelineConfig } from "@/hooks/use-pipeline-config";
import { PipelineControls } from "@/components/admin/pipeline-controls";
import type {
  PipelineJob,
  PipelineStageStats,
  PipelineJobStatus,
  PipelineTriggerResult,
  BriefingRequest,
} from "@/types/admin";

// ── Constants ──

const STAGE_META = [
  { stage: 1, name: "Feed Refresh", icon: Rss, color: "#3B82F6" },
  { stage: 2, name: "Transcription", icon: Mic, color: "#8B5CF6" },
  { stage: 3, name: "Distillation", icon: Sparkles, color: "#F59E0B" },
  { stage: 4, name: "Clip Generation", icon: Scissors, color: "#10B981" },
  { stage: 5, name: "Briefing Assembly", icon: Package, color: "#14B8A6" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  COMPLETED: { color: "#10B981", icon: CheckCircle2, label: "Done" },
  FAILED: { color: "#EF4444", icon: XCircle, label: "Failed" },
  IN_PROGRESS: { color: "#F59E0B", icon: Loader2, label: "Running" },
  PENDING: { color: "#9CA3AF", icon: Clock, label: "Queued" },
  RETRYING: { color: "#F97316", icon: RefreshCw, label: "Retry" },
};

// ── Helpers ──

function formatDuration(ms: number | undefined): string {
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
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ──

function StatusBadge({ status }: { status: PipelineJobStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      <Icon className={cn("h-3 w-3", status === "IN_PROGRESS" && "animate-spin")} />
      {cfg.label}
    </span>
  );
}

function StageHeader({
  meta,
  stats,
  stageToggle,
}: {
  meta: typeof STAGE_META[number];
  stats: PipelineStageStats | undefined;
  stageToggle?: React.ReactNode;
}) {
  const Icon = meta.icon;
  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold"
          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
        >
          {meta.stage}
        </span>
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
        <span className="text-xs font-semibold">{meta.name}</span>
        <div className="ml-auto">{stageToggle}</div>
      </div>
      {stats ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 text-[#F59E0B]" />
            <span className="text-[#9CA3AF]">Active</span>
            <span className="ml-auto font-mono tabular-nums">{stats.activeJobs}</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
            <span className="text-[#9CA3AF]">Rate</span>
            <span className={cn(
              "ml-auto font-mono tabular-nums",
              stats.successRate > 95 ? "text-[#10B981]" : stats.successRate > 80 ? "text-[#F59E0B]" : "text-[#EF4444]"
            )}>
              {stats.successRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3 text-[#3B82F6]" />
            <span className="text-[#9CA3AF]">Avg</span>
            <span className="ml-auto font-mono tabular-nums">{formatDuration(stats.avgProcessingTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-[#10B981]" />
            <span className="text-[#9CA3AF]">Cost</span>
            <span className="ml-auto font-mono tabular-nums">{formatCost(stats.todayCost)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Skeleton className="h-3 w-full bg-white/5" />
          <Skeleton className="h-3 w-3/4 bg-white/5" />
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onClick }: { job: PipelineJob; onClick: () => void }) {
  const stageColor = STAGE_META[(job.stage - 1) % 5].color;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border border-white/5 bg-[#0F1D32] p-2.5 hover:border-white/10 transition-colors group",
        job.status === "FAILED" && "border-l-2 border-l-[#EF4444]"
      )}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <span className="text-[11px] font-medium text-[#F9FAFB] truncate flex-1 leading-tight">
          {job.episodeTitle ?? job.entityId}
        </span>
        <ChevronRight className="h-3 w-3 text-[#9CA3AF]/0 group-hover:text-[#9CA3AF]/60 transition-colors shrink-0 mt-0.5" />
      </div>
      {job.podcastTitle && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {job.podcastImageUrl && (
            <img src={job.podcastImageUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
          )}
          <span className="text-[10px] text-[#9CA3AF] truncate">{job.podcastTitle}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <StatusBadge status={job.status} />
        <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF]">
          {job.durationMs != null && (
            <span className="font-mono tabular-nums">{formatDuration(job.durationMs)}</span>
          )}
          {job.cost != null && (
            <span className="font-mono tabular-nums">{formatCost(job.cost)}</span>
          )}
        </div>
      </div>
      <div className="mt-1.5 text-[10px] text-[#9CA3AF]/60 font-mono">
        {relativeTime(job.startedAt ?? job.createdAt)}
        {job.retryCount > 0 && (
          <span className="ml-1.5 text-[#F97316]">retry #{job.retryCount}</span>
        )}
      </div>
    </button>
  );
}

function FlowArrow({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-6 shrink-0">
      <div className="h-px w-full" style={{ backgroundColor: `${color}30` }} />
      <div className="relative -mt-[3px]">
        <ArrowRight className="h-[6px] w-[6px]" style={{ color: `${color}60` }} />
      </div>
    </div>
  );
}

function PipelineDetailSheet({
  job,
  open,
  onClose,
  onRefresh,
}: {
  job: PipelineJob | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [trace, setTrace] = useState<PipelineJob[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [triggeringEpisode, setTriggeringEpisode] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setTraceLoading(true);
    // Fetch all jobs for the same entity to build a pipeline trace
    const params = new URLSearchParams();
    if (job.entityType === "episode") {
      params.set("search", job.entityId);
    }
    apiFetch<{ data: PipelineJob[]; total: number }>(`/pipeline/jobs?${params}`)
      .then((r) => {
        // Filter to jobs matching this entity
        const entityJobs = r.data.filter(
          (j) => j.entityId === job.entityId && j.entityType === job.entityType
        );
        setTrace(entityJobs);
      })
      .catch(() => setTrace([]))
      .finally(() => setTraceLoading(false));
  }, [job, apiFetch]);

  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-[#0F1D32] border-white/5 text-[#F9FAFB] p-0"
      >
        <SheetHeader className="p-4 border-b border-white/5">
          <SheetTitle className="text-[#F9FAFB] text-sm">
            {job.episodeTitle ?? job.entityId}
          </SheetTitle>
          <SheetDescription className="text-[#9CA3AF] text-xs">
            Job {job.id.slice(0, 8)} &middot; {job.type.replace(/_/g, " ")}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-col h-[calc(100%-5rem)]">
          <TabsList variant="line" className="px-4 border-b border-white/5 bg-transparent">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="trace" className="text-xs">Pipeline Trace</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-auto p-4">
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Status"><StatusBadge status={job.status} /></Field>
                <Field label="Stage">{STAGE_META[(job.stage - 1) % 5].name}</Field>
                <Field label="Created">{relativeTime(job.createdAt)}</Field>
                <Field label="Duration">{formatDuration(job.durationMs)}</Field>
                <Field label="Cost">{formatCost(job.cost)}</Field>
                <Field label="Retries">{job.retryCount}</Field>
              </div>
              {job.errorMessage && (
                <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3 w-3 text-[#EF4444]" />
                    <span className="text-[10px] font-semibold text-[#EF4444]">Error</span>
                  </div>
                  <pre className="text-[10px] text-[#EF4444]/80 font-mono whitespace-pre-wrap break-all">{job.errorMessage}</pre>
                </div>
              )}
              {job.podcastTitle && (
                <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
                  {job.podcastImageUrl && (
                    <img src={job.podcastImageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  )}
                  <div>
                    <div className="text-[11px] font-medium">{job.podcastTitle}</div>
                    {job.episodeTitle && <div className="text-[10px] text-[#9CA3AF]">{job.episodeTitle}</div>}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="trace" className="flex-1 overflow-auto p-4">
            {traceLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 bg-white/5 rounded" />
                ))}
              </div>
            ) : (
              <div className="relative pl-5">
                {/* Vertical timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                <div className="space-y-4">
                  {STAGE_META.map((meta) => {
                    const stageJob = trace.find((t) => t.stage === meta.stage);
                    const status = stageJob?.status ?? "PENDING";
                    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
                    const Icon = cfg.icon;
                    return (
                      <div key={meta.stage} className="relative flex gap-3">
                        <span
                          className="absolute -left-5 top-0.5 flex items-center justify-center h-4 w-4 rounded-full border-2"
                          style={{
                            borderColor: cfg.color,
                            backgroundColor: status === "COMPLETED" ? cfg.color : "transparent",
                          }}
                        >
                          {status === "COMPLETED" && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                          {status === "IN_PROGRESS" && <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: cfg.color }} />}
                          {status === "FAILED" && <XCircle className="h-2.5 w-2.5" style={{ color: cfg.color }} />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium">{meta.name}</span>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={status as PipelineJobStatus} />
                              {(status === "PENDING" || status === "FAILED") && job.entityType === "episode" && (
                                <button
                                  onClick={async () => {
                                    setTriggeringEpisode(job.entityId);
                                    try {
                                      await apiFetch<PipelineTriggerResult>(
                                        `/pipeline/trigger/episode/${job.entityId}`,
                                        { method: "POST" }
                                      );
                                      onRefresh();
                                    } catch (e) {
                                      console.error("Trigger failed:", e);
                                    } finally {
                                      setTriggeringEpisode(null);
                                    }
                                  }}
                                  disabled={triggeringEpisode === job.entityId}
                                  className="flex items-center justify-center h-5 w-5 rounded hover:bg-white/10 transition-colors text-[#3B82F6]"
                                  title="Run from this stage"
                                >
                                  {triggeringEpisode === job.entityId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                          {stageJob && (
                            <div className="mt-1 flex items-center gap-3 text-[10px] text-[#9CA3AF]">
                              {stageJob.startedAt && <span>{relativeTime(stageJob.startedAt)}</span>}
                              {stageJob.durationMs != null && <span>{formatDuration(stageJob.durationMs)}</span>}
                              {stageJob.cost != null && <span>{formatCost(stageJob.cost)}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {job.input != null && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileJson className="h-3 w-3 text-[#3B82F6]" />
                    <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase">Input</span>
                  </div>
                  <pre className="rounded-md bg-[#0A1628] border border-white/5 p-2 text-[10px] font-mono text-[#9CA3AF] overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify(job.input, null, 2)}
                  </pre>
                </div>
              )}
              {job.output != null && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileJson className="h-3 w-3 text-[#10B981]" />
                    <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase">Output</span>
                  </div>
                  <pre className="rounded-md bg-[#0A1628] border border-white/5 p-2 text-[10px] font-mono text-[#9CA3AF] overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify(job.output, null, 2)}
                  </pre>
                </div>
              )}
              {job.input == null && job.output == null && (
                <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                  <FileJson className="h-6 w-6 mb-2 opacity-40" />
                  <span className="text-xs">No log data available</span>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions" className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {(job.status === "FAILED" || job.status === "RETRYING") && (
                <Button
                  className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      await apiFetch(`/pipeline/jobs/${job.id}/retry`, { method: "POST" });
                      onRefresh();
                    } catch (e) {
                      console.error("Retry failed:", e);
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {retrying ? "Retrying..." : "Retry Job"}
                </Button>
              )}
              {job.status === "IN_PROGRESS" && (
                <Button variant="outline" className="w-full border-white/10 text-[#F9FAFB] hover:bg-white/5 text-xs">
                  <Pause className="h-3.5 w-3.5" />
                  Cancel Job
                </Button>
              )}
              <Separator className="bg-white/5" />
              <div className="text-[10px] text-[#9CA3AF] space-y-1 font-mono">
                <div>ID: {job.id}</div>
                <div>Entity: {job.entityType}/{job.entityId}</div>
                <div>Created: {new Date(job.createdAt).toISOString()}</div>
                {job.startedAt && <div>Started: {new Date(job.startedAt).toISOString()}</div>}
                {job.completedAt && <div>Completed: {new Date(job.completedAt).toISOString()}</div>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white/[0.03] p-2">
      <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[11px]">{children}</div>
    </div>
  );
}

// ── Transcript Inspector ──

function TranscriptInspector({
  open,
  onClose,
  episodeId,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string | null;
}) {
  const apiFetch = useAdminFetch();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open || !episodeId) return;
    setLoading(true);
    setTranscript(null);
    apiFetch<{ data: { title?: string; transcript?: string; distillation?: { transcript?: string } } }>(
      `/episodes/${episodeId}`
    )
      .then((r) => {
        setTitle(r.data.title ?? episodeId);
        setTranscript(
          r.data.transcript ?? r.data.distillation?.transcript ?? null
        );
      })
      .catch(() => setTranscript(null))
      .finally(() => setLoading(false));
  }, [open, episodeId, apiFetch]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#8B5CF6]" />
            Transcript: {title}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 bg-white/5 rounded" />
              ))}
            </div>
          ) : transcript ? (
            <pre className="text-[11px] font-mono text-[#9CA3AF] whitespace-pre-wrap break-words p-4 leading-relaxed">
              {transcript}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <FileText className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No transcript available</span>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading ──

function PipelineSkeleton() {
  return (
    <div className="flex gap-0 h-full">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          {i > 0 && <div className="w-6" />}
          <Skeleton className="h-full bg-white/5 rounded-lg mx-1" />
        </div>
      ))}
    </div>
  );
}

// ── Main ──

export default function Pipeline() {
  const apiFetch = useAdminFetch();
  const {
    config: pipelineConfig,
    saving: pipelineSaving,
    triggering: pipelineTriggering,
    togglePipeline,
    toggleStage,
    triggerFeedRefresh,
  } = usePipelineConfig();

  const [stageStats, setStageStats] = useState<PipelineStageStats[]>([]);
  const [stageJobs, setStageJobs] = useState<Record<number, PipelineJob[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [triggeringFeedRefresh, setTriggeringFeedRefresh] = useState(false);

  // Request filter
  const [requests, setRequests] = useState<{ id: string; status: string }[]>([]);
  const [requestFilter, setRequestFilter] = useState<string>("all");

  // Transcript inspector
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptEpisodeId, setTranscriptEpisodeId] = useState<string | null>(null);

  // Load request list for filter dropdown
  useEffect(() => {
    apiFetch<{ data: BriefingRequest[] }>("/requests?page=1")
      .then((r) => {
        const valid = (r.data ?? []).filter((req) => req.id && req.status);
        setRequests(valid.map((req) => ({ id: req.id, status: req.status })));
      })
      .catch(() => setRequests([]));
  }, [apiFetch]);

  const load = useCallback(() => {
    setLoading(true);
    const requestParam = requestFilter !== "all" ? `&requestId=${requestFilter}` : "";
    Promise.all([
      apiFetch<{ data: PipelineStageStats[] }>("/pipeline/stages")
        .then((r) => setStageStats(r.data))
        .catch(console.error),
      ...STAGE_META.map((m) =>
        apiFetch<{ data: PipelineJob[] }>(`/pipeline/jobs?stage=${m.stage}&limit=20${requestParam}`)
          .then((r) => setStageJobs((prev) => ({ ...prev, [m.stage]: r.data })))
          .catch(console.error)
      ),
    ]).finally(() => setLoading(false));
  }, [apiFetch, requestFilter]);

  useEffect(() => { load(); }, [load]);

  const handleJobClick = (job: PipelineJob) => {
    // Stage 2 (Transcription) jobs open transcript inspector
    if (job.stage === 2 && job.entityType === "episode") {
      setTranscriptEpisodeId(job.entityId);
      setTranscriptOpen(true);
      return;
    }
    setSelectedJob(job);
    setSheetOpen(true);
  };

  if (loading && stageStats.length === 0) return <PipelineSkeleton />;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Pipeline Flow</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {Object.values(stageJobs).flat().filter((j) => j.status === "IN_PROGRESS").length} active
          </Badge>
          <div className="ml-4 border-l border-white/10 pl-4">
            <PipelineControls
              variant="master-only"
              config={pipelineConfig}
              saving={pipelineSaving}
              triggering={pipelineTriggering}
              onTogglePipeline={togglePipeline}
              onToggleStage={toggleStage}
              onTriggerFeedRefresh={triggerFeedRefresh}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Request filter */}
          {requests.length > 0 && (
            <Select value={requestFilter} onValueChange={setRequestFilter}>
              <SelectTrigger className="w-44 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                <SelectValue placeholder="Filter by request" />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                <SelectItem value="all" className="text-xs">All Requests</SelectItem>
                {requests.map((req) => (
                  <SelectItem key={req.id} value={req.id} className="text-xs">
                    {String(req.id).slice(0, 8)}... ({req.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={async () => {
              setTriggeringFeedRefresh(true);
              try {
                await apiFetch<PipelineTriggerResult>("/pipeline/trigger/feed-refresh", { method: "POST" });
                load();
              } catch (e) {
                console.error("Failed to trigger feed refresh:", e);
              } finally {
                setTriggeringFeedRefresh(false);
              }
            }}
            disabled={triggeringFeedRefresh}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {triggeringFeedRefresh ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Feed Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stage Columns */}
      <div className="flex gap-0 flex-1 min-h-0">
        {STAGE_META.map((meta, idx) => {
          const stats = stageStats.find((s) => s.stage === meta.stage);
          const jobs = stageJobs[meta.stage] ?? [];
          return (
            <div key={meta.stage} className="contents">
              {idx > 0 && <FlowArrow color={STAGE_META[idx - 1].color} />}
              <div className="flex-1 flex flex-col rounded-lg bg-[#1A2942] border border-white/5 min-h-0 overflow-hidden">
                <StageHeader
                  meta={meta}
                  stats={stats}
                  stageToggle={
                    <PipelineControls
                      variant="stage-only"
                      stage={meta.stage}
                      config={pipelineConfig}
                      saving={pipelineSaving}
                      triggering={pipelineTriggering}
                      onTogglePipeline={togglePipeline}
                      onToggleStage={toggleStage}
                      onTriggerFeedRefresh={triggerFeedRefresh}
                    />
                  }
                />
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-1.5">
                    {jobs.map((job) => (
                      <JobCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
                    ))}
                    {jobs.length === 0 && !loading && (
                      <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                        <Clock className="h-5 w-5 mb-1.5 opacity-40" />
                        <span className="text-[10px]">No jobs</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Sheet */}
      <PipelineDetailSheet
        job={selectedJob}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedJob(null); }}
        onRefresh={load}
      />

      {/* Transcript Inspector */}
      <TranscriptInspector
        open={transcriptOpen}
        onClose={() => { setTranscriptOpen(false); setTranscriptEpisodeId(null); }}
        episodeId={transcriptEpisodeId}
      />
    </div>
  );
}
