import React, { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronRight,
  SkipForward,
  Minus,
  Zap,
  FileAudio,
  HardDrive,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  JobProgress,
  StepProgress,
  PipelineStepStatus,
} from "@/types/admin";
import { EventTimeline } from "./event-timeline";
import { StepWorkProductPanel, WorkProductBadge, formatTokens } from "./work-product-panel";
import { SourceAudioPlayer } from "./audio-players";

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

function formatStageName(stage: string): string {
  switch (stage) {
    case "TRANSCRIPTION": return "Transcription";
    case "DISTILLATION": return "Distillation";
    case "NARRATIVE_GENERATION": return "Narrative Gen";
    case "AUDIO_GENERATION": return "Audio Gen";
    case "CLIP_GENERATION": return "Clip Gen";
    case "BRIEFING_ASSEMBLY": return "Assembly";
    default: return stage;
  }
}

export function ExpandableStepRow({
  step,
  episodeId,
  showDebug,
  showDetails,
}: {
  step: StepProgress;
  episodeId: string;
  showDebug: boolean;
  showDetails: boolean;
}) {
  const events = step.events ?? [];
  const wps = step.workProducts ?? [];
  const isTranscription = step.stage === "TRANSCRIPTION";
  const hasContent = events.length > 0 || wps.length > 0 || isTranscription;

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
          {step.durationMs != null ? `${step.durationMs}ms` : "\u2014"}
        </span>

        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.inputTokens != null ? formatTokens(step.inputTokens) : "\u2014"}
        </span>

        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.outputTokens != null ? formatTokens(step.outputTokens) : "\u2014"}
        </span>

        <span className="text-[9px] text-[#10B981] font-mono tabular-nums text-right">
          {step.cost != null ? `$${step.cost.toFixed(4)}` : "\u2014"}
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
                  <EventTimeline events={events} stepStatus={step.status} showDebug={showDebug} showDetails={showDetails} />
                </div>
              )}
            </div>
          )}

          {(wps.length > 0 || isTranscription) && (
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
                <span className="text-[#6B7280]">({wps.length + (isTranscription ? 1 : 0)})</span>
              </button>
              {showWps && (
                <div className="pl-5 space-y-1">
                  {isTranscription && (
                    <div className="rounded-md bg-[#0A1628] border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-[#0F1D32] border-b border-white/5">
                        <FileAudio className="h-2.5 w-2.5" style={{ color: "#F97316" }} />
                        <span className="text-[8px] font-medium" style={{ color: "#F97316" }}>Source Audio</span>
                        <span className="text-[8px] text-[#9CA3AF]">(streamed from source)</span>
                      </div>
                      <SourceAudioPlayer episodeId={episodeId} />
                    </div>
                  )}
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

export function RequestCostSummary({ jobs }: { jobs: JobProgress[] }) {
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

export function JobProgressTree({ jobs, highlightJobId, jobRef, showDebug, showDetails }: { jobs: JobProgress[]; highlightJobId?: string | null; jobRef?: React.RefObject<HTMLDivElement | null>; showDebug: boolean; showDetails: boolean }) {
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
            <ExpandableStepRow key={`${job.jobId}-${step.stage}`} step={step} episodeId={job.episodeId} showDebug={showDebug} showDetails={showDetails} />
          ))}
        </div>
      ))}
      </div>
    </div>
  );
}
