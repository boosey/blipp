import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mic,
  Sparkles,
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
  Play,
  FileText,
  Volume2,
  Ban,
  Zap,
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
  PipelineStep,
  PipelineStage,
  PipelineStageStats,
  PipelineJobStatus,
  PipelineTriggerResult,
  BriefingRequest,
} from "@/types/admin";

// ── Constants ──

const STAGE_META: { stage: PipelineStage; name: string; icon: React.ElementType; color: string }[] = [
  { stage: "TRANSCRIPTION", name: "Transcription", icon: Mic, color: "#8B5CF6" },
  { stage: "DISTILLATION", name: "Distillation", icon: Sparkles, color: "#F59E0B" },
  { stage: "NARRATIVE_GENERATION", name: "Narrative Gen", icon: FileText, color: "#10B981" },
  { stage: "AUDIO_GENERATION", name: "Audio Gen", icon: Volume2, color: "#06B6D4" },
  { stage: "BRIEFING_ASSEMBLY", name: "Briefing Assembly", icon: Package, color: "#3B82F6" },
];

const STAGE_ORDER: PipelineStage[] = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"];

const STATUS_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 0,
  PENDING: 1,
  FAILED: 2,
  COMPLETED: 3,
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  COMPLETED: { color: "#10B981", icon: CheckCircle2, label: "Done" },
  FAILED: { color: "#EF4444", icon: XCircle, label: "Failed" },
  IN_PROGRESS: { color: "#F59E0B", icon: Loader2, label: "Running" },
  PENDING: { color: "#9CA3AF", icon: Clock, label: "Queued" },
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

function stageName(stage: PipelineStage): string {
  return STAGE_META.find((m) => m.stage === stage)?.name ?? stage;
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

function DurationTierBadge({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-[#3B82F6]/10 text-[#3B82F6]">
      <Timer className="h-3 w-3" />
      {minutes} min
    </span>
  );
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  const meta = STAGE_META.find((m) => m.stage === stage);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
    >
      <Icon className="h-3 w-3" />
      {meta.name}
    </span>
  );
}

function StageHeader({
  meta,
  stats,
  stageToggle,
  pendingCount,
}: {
  meta: (typeof STAGE_META)[number];
  stats: PipelineStageStats | undefined;
  stageToggle?: React.ReactNode;
  pendingCount?: number;
}) {
  const Icon = meta.icon;
  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex items-center justify-center h-6 w-6 rounded-full"
          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold">{meta.name}</span>
        {pendingCount != null && pendingCount > 0 && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-medium bg-[#9CA3AF]/10 text-[#9CA3AF]">
            {pendingCount} queued
          </span>
        )}
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
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border border-white/5 bg-[#0F1D32] p-2.5 hover:border-white/10 transition-all duration-300 group animate-in fade-in slide-in-from-top-2",
        job.status === "FAILED" && "border-l-2 border-l-[#EF4444]"
      )}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <span className="text-[11px] font-medium text-[#F9FAFB] truncate flex-1 leading-tight">
          {job.episodeTitle ?? job.episodeId}
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
      <div className="flex items-center justify-between mb-1.5">
        <StatusBadge status={job.status} />
        <div className="flex items-center gap-1.5">
          {job.episodeDurationSeconds != null && (
            <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
              {Math.round(job.episodeDurationSeconds / 60)}m ep
            </span>
          )}
          <DurationTierBadge minutes={job.durationTier} />
          <StageBadge stage={job.currentStage} />
        </div>
      </div>
      <div className="text-[10px] text-[#9CA3AF]/60 font-mono">
        {relativeTime(job.createdAt)}
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

function PipelineSummaryBar({
  jobs,
  onFilter,
  activeFilter,
}: {
  jobs: PipelineJob[];
  onFilter: (status: PipelineJobStatus | null) => void;
  activeFilter: PipelineJobStatus | null;
}) {
  const counts: Record<PipelineJobStatus, number> = {
    PENDING: jobs.filter((j) => j.status === "PENDING").length,
    IN_PROGRESS: jobs.filter((j) => j.status === "IN_PROGRESS").length,
    COMPLETED: jobs.filter((j) => j.status === "COMPLETED").length,
    FAILED: jobs.filter((j) => j.status === "FAILED").length,
  };

  const badges: { status: PipelineJobStatus; label: string; color: string }[] = [
    { status: "PENDING", label: "Queued", color: "#9CA3AF" },
    { status: "IN_PROGRESS", label: "Processing", color: "#F59E0B" },
    { status: "COMPLETED", label: "Completed", color: "#10B981" },
    { status: "FAILED", label: "Failed", color: "#EF4444" },
  ];

  return (
    <div className="flex items-center gap-1.5" data-testid="pipeline-summary-bar">
      {badges.map(({ status, label, color }) => (
        <button
          key={status}
          onClick={() => onFilter(activeFilter === status ? null : status)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            activeFilter === status
              ? "ring-1 ring-white/20"
              : "hover:ring-1 hover:ring-white/10"
          )}
          style={{
            backgroundColor: `${color}${activeFilter === status ? "25" : "10"}`,
            color,
          }}
        >
          <span className="font-mono tabular-nums">{counts[status]}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

function StepRow({ step }: { step: PipelineStep }) {
  const meta = STAGE_META.find((m) => m.stage === step.stage);
  const cfg = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-2 rounded-md bg-white/[0.03] border border-white/5 p-2">
      <span
        className="flex items-center justify-center h-5 w-5 rounded-full shrink-0"
        style={{ backgroundColor: `${cfg.color}15` }}
      >
        <Icon className={cn("h-3 w-3", step.status === "IN_PROGRESS" && "animate-spin")} style={{ color: cfg.color }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium">{meta?.name ?? step.stage}</span>
          {step.cached && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-[#10B981]/10 text-[#10B981]">
              <Zap className="h-2.5 w-2.5" />
              cached
            </span>
          )}
        </div>
        {step.errorMessage && (
          <div className="text-[10px] text-[#EF4444]/80 truncate mt-0.5">{step.errorMessage}</div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF] font-mono tabular-nums shrink-0">
        {step.durationMs != null && <span>{formatDuration(step.durationMs)}</span>}
        {step.cost != null && <span className="text-[#10B981]">{formatCost(step.cost)}</span>}
        {step.model && (
          <span className="text-[#8B5CF6]" title={step.model}>
            {step.model.split("+").map(m => m.split("-").slice(0, 3).join("-")).join("+")}
          </span>
        )}
        {(step.inputTokens != null || step.outputTokens != null) && (
          <span title={`In: ${step.inputTokens ?? 0} / Out: ${step.outputTokens ?? 0}`}>
            {step.inputTokens != null ? `${step.inputTokens.toLocaleString()}in` : ""}
            {step.outputTokens != null && step.outputTokens > 0 ? `/${step.outputTokens.toLocaleString()}out` : ""}
          </span>
        )}
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
  const [detail, setDetail] = useState<PipelineJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!job) return;
    setDetailLoading(true);
    setDetail(null);
    apiFetch<{ data: PipelineJob }>(`/pipeline/jobs/${job.id}`)
      .then((r) => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [job, apiFetch]);

  if (!job) return null;

  const steps = (detail?.steps ?? []).sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-[#0F1D32] border-white/5 text-[#F9FAFB] p-0"
      >
        <SheetHeader className="p-4 border-b border-white/5">
          <SheetTitle className="text-[#F9FAFB] text-sm">
            {job.episodeTitle ?? job.episodeId}
          </SheetTitle>
          <SheetDescription className="text-[#9CA3AF] text-xs">
            Job {job.id.slice(0, 8)} &middot; {job.durationTier} min tier
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-col h-[calc(100%-5rem)]">
          <TabsList variant="line" className="px-4 border-b border-white/5 bg-transparent">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="steps" className="text-xs">Steps</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-auto p-4">
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Status"><StatusBadge status={job.status} /></Field>
                <Field label="Current Stage"><StageBadge stage={job.currentStage} /></Field>
                <Field label="Duration Tier"><DurationTierBadge minutes={job.durationTier} /></Field>
                {job.episodeDurationSeconds != null && (
                  <Field label="Episode Length">{Math.round(job.episodeDurationSeconds / 60)}m ({Math.round(job.episodeDurationSeconds / 60 * 10) / 10} min)</Field>
                )}
                <Field label="Created">{relativeTime(job.createdAt)}</Field>
                <Field label="Request">{job.requestId.slice(0, 8)}...</Field>
                <Field label="Updated">{relativeTime(job.updatedAt)}</Field>
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

          <TabsContent value="steps" className="flex-1 overflow-auto p-4">
            {detailLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 bg-white/5 rounded" />
                ))}
              </div>
            ) : steps.length > 0 ? (
              <div className="space-y-2">
                {steps.map((step) => (
                  <StepRow key={step.id} step={step} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                <FileJson className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No step data available</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="actions" className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {job.status === "FAILED" && (
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
              {(job.status === "PENDING" || job.status === "IN_PROGRESS") && (
                <Button
                  variant="outline"
                  className="w-full border-white/10 text-[#F9FAFB] hover:bg-white/5 text-xs"
                  disabled={cancelling}
                  onClick={async () => {
                    setCancelling(true);
                    try {
                      await apiFetch(`/pipeline/jobs/${job.id}/cancel`, { method: "POST" });
                      onRefresh();
                    } catch (e) {
                      console.error("Cancel failed:", e);
                    } finally {
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                  {cancelling ? "Cancelling..." : "Cancel Job"}
                </Button>
              )}
              <Separator className="bg-white/5" />
              <div className="text-[10px] text-[#9CA3AF] space-y-1 font-mono">
                <div>ID: {job.id}</div>
                <div>Episode: {job.episodeId}</div>
                <div>Request: {job.requestId}</div>
                <div>Created: {new Date(job.createdAt).toISOString()}</div>
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
      {Array.from({ length: 3 }).map((_, i) => (
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
  const [stageJobs, setStageJobs] = useState<Record<PipelineStage, PipelineJob[]>>({
    TRANSCRIPTION: [],
    DISTILLATION: [],
    NARRATIVE_GENERATION: [],
    AUDIO_GENERATION: [],
    CLIP_GENERATION: [], // legacy
    BRIEFING_ASSEMBLY: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters
  const [requests, setRequests] = useState<{ id: string; status: string }[]>([]);
  const [requestFilter, setRequestFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PipelineJobStatus | null>(null);

  // Transcript inspector
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptEpisodeId, setTranscriptEpisodeId] = useState<string | null>(null);

  // Auto-refresh ref
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load request list for filter dropdown
  useEffect(() => {
    apiFetch<{ data: BriefingRequest[] }>("/requests?page=1")
      .then((r) => {
        const valid = (r.data ?? []).filter((req) => req.id && req.status);
        setRequests(valid.map((req) => ({ id: req.id, status: req.status })));
      })
      .catch(() => setRequests([]));
  }, [apiFetch]);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const requestParam = requestFilter !== "all" ? `&requestId=${requestFilter}` : "";
    const statusParam = statusFilter ? `&status=${statusFilter}` : "";
    Promise.all([
      apiFetch<{ data: PipelineStageStats[] }>("/pipeline/stages")
        .then((r) => setStageStats(r.data))
        .catch(console.error),
      ...STAGE_META.map((m) =>
        apiFetch<{ data: PipelineJob[] }>(`/pipeline/jobs?currentStage=${m.stage}&pageSize=20${requestParam}${statusParam}${stageFilter !== "all" && stageFilter !== m.stage ? "&skip=true" : ""}`)
          .then((r) => setStageJobs((prev) => ({ ...prev, [m.stage]: r.data })))
          .catch(console.error)
      ),
    ]).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [apiFetch, requestFilter, stageFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => load(true), 10_000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [load]);

  const handleJobClick = (job: PipelineJob) => {
    // Transcription jobs open transcript inspector
    if (job.currentStage === "TRANSCRIPTION") {
      setTranscriptEpisodeId(job.episodeId);
      setTranscriptOpen(true);
      return;
    }
    setSelectedJob(job);
    setSheetOpen(true);
  };

  const allJobs = Object.values(stageJobs).flat();

  const sortedFilteredJobs = (stage: PipelineStage): PipelineJob[] => {
    const jobs = stageJobs[stage] ?? [];
    // When no status filter active, hide completed jobs from flow columns
    const filtered = statusFilter
      ? jobs.filter((j) => j.status === statusFilter)
      : jobs.filter((j) => j.status !== "COMPLETED");
    return filtered.sort(
      (a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
    );
  };

  if (loading && stageStats.length === 0) return <PipelineSkeleton />;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Pipeline Flow</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {allJobs.filter((j) => j.status === "IN_PROGRESS").length} active
          </Badge>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Live
          </span>
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
          {/* Stage filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectItem value="all" className="text-xs">All Stages</SelectItem>
              {STAGE_META.map((m) => (
                <SelectItem key={m.stage} value={m.stage} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={() => { setRefreshing(true); load(); }}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <PipelineSummaryBar
        jobs={allJobs}
        onFilter={setStatusFilter}
        activeFilter={statusFilter}
      />

      {/* Stage Columns — 3 columns: Transcription, Distillation, Clip Generation */}
      <div className="flex gap-0 flex-1 min-h-0" data-testid="pipeline-columns">
        {STAGE_META.map((meta, idx) => {
          const stats = stageStats.find((s) => s.stage === meta.stage);
          const jobs = sortedFilteredJobs(meta.stage);
          const rawJobs = stageJobs[meta.stage] ?? [];
          const pendingCount = rawJobs.filter((j) => j.status === "PENDING").length;

          // If stage filter is active and doesn't match, hide this column
          if (stageFilter !== "all" && stageFilter !== meta.stage) return null;

          return (
            <div key={meta.stage} className="contents">
              {idx > 0 && (stageFilter === "all") && <FlowArrow color={STAGE_META[idx - 1].color} />}
              <div className="flex-1 flex flex-col rounded-lg bg-[#1A2942] border border-white/5 min-h-0 overflow-hidden" data-testid={`stage-column-${meta.stage}`}>
                <StageHeader
                  meta={meta}
                  stats={stats}
                  pendingCount={pendingCount}
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
