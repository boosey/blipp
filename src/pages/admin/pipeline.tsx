import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePolling } from "@/hooks/use-polling";
import { Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import { usePipelineConfig } from "@/hooks/use-pipeline-config";
import { PipelineControls } from "@/components/admin/pipeline-controls";
import { STAGE_META, STATUS_PRIORITY } from "@/components/admin/pipeline/pipeline-constants";
import { StageHeader, JobCard, FlowArrow, PipelineSkeleton } from "@/components/admin/pipeline/stage-column";
import { PipelineDetailSheet } from "@/components/admin/pipeline/pipeline-detail-sheet";
import { TranscriptInspector } from "@/components/admin/pipeline/transcript-inspector";
import { DlqSection } from "@/components/admin/pipeline/dlq-section";
import type {
  PipelineJob,
  PipelineStage,
  PipelineStageStats,
  BriefingRequest,
} from "@/types/admin";

export default function Pipeline() {
  const navigate = useNavigate();
  const apiFetch = useAdminFetch();
  const {
    config: pipelineConfig,
    saving: pipelineSaving,
    togglePipeline,
    toggleStage,
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

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const requestParam = requestFilter !== "all" ? `&requestId=${requestFilter}` : "";
    Promise.all([
      apiFetch<{ data: PipelineStageStats[] }>("/pipeline/stages")
        .then((r) => setStageStats(r.data))
        .catch(console.error),
      ...STAGE_META.map((m) =>
        apiFetch<{ data: PipelineJob[] }>(`/pipeline/jobs?currentStage=${m.stage}&pageSize=20${requestParam}${stageFilter !== "all" && stageFilter !== m.stage ? "&skip=true" : ""}`)
          .then((r) => setStageJobs((prev) => ({ ...prev, [m.stage]: r.data })))
          .catch(console.error)
      ),
    ]).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [apiFetch, requestFilter, stageFilter]);

  useEffect(() => { load(); }, [load]);

  usePolling(() => load(true), 5_000);

  const handleJobClick = (job: PipelineJob) => {
    if (job.currentStage === "TRANSCRIPTION") {
      setTranscriptEpisodeId(job.episodeId);
      setTranscriptOpen(true);
      return;
    }
    setSelectedJob(job);
    setSheetOpen(true);
  };

  const handleJobDoubleClick = (job: PipelineJob) => {
    navigate(`/admin/requests?requestId=${job.requestId}&jobId=${job.id}`);
  };

  const allJobs = Object.values(stageJobs).flat();

  const sortedFilteredJobs = (stage: PipelineStage): PipelineJob[] => {
    const jobs = stageJobs[stage] ?? [];
    const filtered = jobs.filter((j) => j.status === "IN_PROGRESS" || j.status === "PENDING");
    return filtered.sort(
      (a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
    );
  };

  if (loading && stageStats.length === 0) return <PipelineSkeleton />;

  return (
    <div className="h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
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
              onTogglePipeline={togglePipeline}
              onToggleStage={toggleStage}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Stage Columns */}
      <div className="flex gap-0 flex-1 min-h-0 overflow-x-auto" data-testid="pipeline-columns">
        {STAGE_META.map((meta, idx) => {
          const stats = stageStats.find((s) => s.stage === meta.stage);
          const jobs = sortedFilteredJobs(meta.stage);
          const rawJobs = stageJobs[meta.stage] ?? [];
          const activeCount = rawJobs.filter((j) => j.status === "IN_PROGRESS").length;
          const pendingCount = rawJobs.filter((j) => j.status === "PENDING").length;

          if (stageFilter !== "all" && stageFilter !== meta.stage) return null;

          return (
            <div key={meta.stage} className="contents">
              {idx > 0 && (stageFilter === "all") && <FlowArrow color={STAGE_META[idx - 1].color} />}
              <div className="flex-1 min-w-[200px] md:min-w-0 flex flex-col rounded-lg bg-[#1A2942] border border-white/5 min-h-0 overflow-hidden" data-testid={`stage-column-${meta.stage}`}>
                <StageHeader
                  meta={meta}
                  stats={stats}
                  activeCount={activeCount}
                  pendingCount={pendingCount}
                  stageToggle={
                    <PipelineControls
                      variant="stage-only"
                      stage={meta.stage}
                      config={pipelineConfig}
                      saving={pipelineSaving}
                      onTogglePipeline={togglePipeline}
                      onToggleStage={toggleStage}
                    />
                  }
                />
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-1.5">
                    {jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onClick={() => handleJobClick(job)}
                        onDoubleClick={() => handleJobDoubleClick(job)}
                      />
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

      <PipelineDetailSheet
        job={selectedJob}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedJob(null); }}
        onRefresh={load}
      />

      <TranscriptInspector
        open={transcriptOpen}
        onClose={() => { setTranscriptOpen(false); setTranscriptEpisodeId(null); }}
        episodeId={transcriptEpisodeId}
      />

      <DlqSection />
    </div>
  );
}
