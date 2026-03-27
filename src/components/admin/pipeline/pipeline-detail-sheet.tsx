import { useState, useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileJson,
  Ban,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_META, STAGE_ORDER, STATUS_CONFIG, formatDuration, formatCost } from "./pipeline-constants";
import { StatusBadge, DurationTierBadge, StageBadge, Field } from "./pipeline-badges";
import { relativeTime } from "@/lib/admin-formatters";
import type { PipelineJob, PipelineStep } from "@/types/admin";

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

export interface PipelineDetailSheetProps {
  job: PipelineJob | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function PipelineDetailSheet({
  job,
  open,
  onClose,
  onRefresh,
}: PipelineDetailSheetProps) {
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
