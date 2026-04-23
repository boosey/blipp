import { useState, useEffect, useCallback, useRef } from "react";
import {
  FlaskConical,
  ArrowLeft,
  Loader2,
  Trash2,
  XCircle,
  Trophy,
  DollarSign,
  Timer,
  BarChart3,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { useAuth } from "@clerk/clerk-react";
import { useAdminFetch } from "@/lib/api-client";
import { getApiBase } from "@/lib/api-base";
import { relativeTime, formatCost, formatLatency } from "@/lib/admin-formatters";
import { ProgressBar } from "@/components/admin/progress-bar";
import { StatusBadge } from "@/components/admin/status-badge";
import { processAudio } from "@/lib/audio-processing";
import { ResultStatusBadge, computeWinners } from "./hypothesis-diff-viewer";
import { HypothesisDiffViewer } from "./hypothesis-diff-viewer";
import type {
  SttExperiment,
  SttExperimentStatus,
  SttBenchmarkResult,
  SttResultsGrid,
} from "@/types/admin";

const STATUS_STYLES: Record<
  SttExperimentStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
  CANCELLED: { bg: "#EAB30820", text: "#EAB308" },
};

function qualifiedModel(model: string, provider?: string): string {
  if (!provider) return model;
  return `${model} (${provider})`;
}

function formatWer(wer: number): string {
  return `${(wer * 100).toFixed(1)}%`;
}

export interface ResultsDashboardProps {
  experiment: SttExperiment;
  onBack: () => void;
}

function EpisodeTranscripts({
  results,
}: {
  results: SttBenchmarkResult[];
}) {
  const apiFetch = useAdminFetch();
  const [refText, setRefText] = useState<string | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const refResultId = results.find((r) => r.status === "COMPLETED" && r.r2RefTranscriptKey)?.id ?? "";

  const loadRef = useCallback(async () => {
    if (refText !== null || !refResultId) return;
    setRefLoading(true);
    try {
      const data = await apiFetch<{ data: { transcript: string } }>(
        `/stt-benchmark/results/${refResultId}/reference-transcript`
      );
      setRefText(data.data.transcript);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setRefLoading(false);
    }
  }, [apiFetch, refResultId, refText]);

  return (
    <Accordion type="multiple" className="mt-1">
      <AccordionItem value={`ref-${refResultId}`} className="border-white/5">
        <AccordionTrigger
          className="text-[#10B981] text-[10px] hover:no-underline py-1"
          onClick={loadRef}
        >
          Official Reference (as compared)
        </AccordionTrigger>
        <AccordionContent>
          {refLoading && (
            <div className="text-[#9CA3AF] text-xs flex items-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          )}
          {refError && <div className="text-[#EF4444] text-xs py-2">{refError}</div>}
          {refText !== null && (
            <pre className="text-[#D1D5DB] text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-[#0A1628] rounded p-3 max-h-64 overflow-auto font-sans">
              {refText}
            </pre>
          )}
        </AccordionContent>
      </AccordionItem>

      {results
        .filter((r) => r.status === "COMPLETED" && r.r2TranscriptKey)
        .map((r) => (
          <HypothesisDiffViewer
            key={r.id}
            resultId={r.id}
            model={qualifiedModel(r.model, r.provider)}
            speed={r.speed}
            refText={refText}
            onNeedRef={loadRef}
          />
        ))}
    </Accordion>
  );
}

export function ResultsDashboard({
  experiment: initialExperiment,
  onBack,
}: ResultsDashboardProps) {
  const apiFetch = useAdminFetch();
  const { getToken } = useAuth();

  const [experiment, setExperiment] = useState<SttExperiment>(initialExperiment);
  const [results, setResults] = useState<SttBenchmarkResult[]>([]);
  const [grid, setGrid] = useState<SttResultsGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [audioPhase, setAudioPhase] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [audioProgress, setAudioProgress] = useState({ done: 0, total: 0 });
  const [audioError, setAudioError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadResults = useCallback(async () => {
    try {
      const data = await apiFetch<{
        data: {
          experiment: SttExperiment;
          results: SttBenchmarkResult[];
          grid: SttResultsGrid[];
        };
      }>(`/stt-benchmark/experiments/${experiment.id}/results`);
      if (!mountedRef.current) return;
      setExperiment(data.data.experiment);
      setResults(data.data.results);
      setGrid(data.data.grid);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFetch, experiment.id]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const runNextAndPoll = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { done: boolean } }>(
        `/stt-benchmark/experiments/${experiment.id}/run`,
        { method: "POST" }
      );
      if (res.data.done) {
        await loadResults();
        return;
      }
    } catch (err) {
      console.error("runNext error:", err instanceof Error ? err.message : err);
    }
    await loadResults();
  }, [apiFetch, experiment.id, loadResults]);

  const hasPollingResults = results.some((r) => r.status === "POLLING");
  const shouldPoll = experiment.status === "RUNNING" || hasPollingResults;

  useEffect(() => {
    if (shouldPoll) {
      pollRef.current = setInterval(runNextAndPoll, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [shouldPoll, runNextAndPoll]);

  const processAndUploadAudio = useCallback(async () => {
    setAudioPhase("processing");
    setAudioError(null);

    const episodes = experiment.config.episodeIds;
    const speeds = experiment.config.speeds;
    const total = episodes.length * speeds.length;
    setAudioProgress({ done: 0, total });

    try {
      let done = 0;

      for (const episodeId of episodes) {
        for (const speed of speeds) {
          const matchingResult = results.find(
            (r) => r.episodeId === episodeId && r.speed === speed
          );
          if (!matchingResult?.r2AudioKey) {
            const token = await getToken();
            const proxyUrl = `/api/admin/stt-benchmark/episode-audio/${episodeId}`;
            const blob = await processAudio(proxyUrl, speed, token!);

            const uploadToken = await getToken();
            const formData = new FormData();
            formData.append("file", blob, `${episodeId}_${speed}x.mp3`);
            formData.append("experimentId", experiment.id);
            formData.append("episodeId", episodeId);
            formData.append("speed", String(speed));

            await fetch(`${getApiBase()}/api/admin/stt-benchmark/upload-audio`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${uploadToken}`,
              },
              body: formData,
            });
          }

          done++;
          if (mountedRef.current) setAudioProgress({ done, total });
        }
      }

      if (mountedRef.current) setAudioPhase("done");
    } catch (err) {
      if (mountedRef.current) {
        setAudioPhase("error");
        setAudioError(
          err instanceof Error ? err.message : "Audio processing failed"
        );
      }
    }
  }, [experiment, results, apiFetch, getToken]);

  const startRun = useCallback(async () => {
    try {
      await apiFetch<{ data: SttExperiment }>(
        `/stt-benchmark/experiments/${experiment.id}/run`,
        { method: "POST" }
      );
      loadResults();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start experiment"
      );
    }
  }, [apiFetch, experiment.id, loadResults]);

  const handleProcessAndRun = useCallback(async () => {
    await processAndUploadAudio();
    if (mountedRef.current) {
      await startRun();
    }
  }, [processAndUploadAudio, startRun]);

  const handleCancel = async () => {
    try {
      await apiFetch<{ data: SttExperiment }>(
        `/stt-benchmark/experiments/${experiment.id}/cancel`,
        { method: "POST" }
      );
      loadResults();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel experiment"
      );
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch<void>(`/stt-benchmark/experiments/${experiment.id}`, {
        method: "DELETE",
      });
      onBack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete experiment"
      );
    }
  };

  const winners = computeWinners(grid);

  const resultsByEpisode = results.reduce(
    (acc, r) => {
      const key = r.episodeId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    },
    {} as Record<string, SttBenchmarkResult[]>
  );

  const gridSpeeds = [...new Set(grid.map((g) => g.speed))].sort();
  const gridModelKeys = [...new Set(grid.map((g) => `${g.model}|${g.provider}`))];
  const gridModels = gridModelKeys.map((k) => {
    const [model, provider] = k.split("|");
    return { model, provider };
  });

  const gridBySpeed: Record<number, SttResultsGrid[]> = {};
  for (const g of grid) {
    if (!gridBySpeed[g.speed]) gridBySpeed[g.speed] = [];
    gridBySpeed[g.speed].push(g);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 bg-white/5" />
        <Skeleton className="h-32 w-full bg-white/5" />
        <Skeleton className="h-64 w-full bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[#F9FAFB]">
              {experiment.name}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={experiment.status} styles={STATUS_STYLES} />
              <span className="text-[10px] text-[#9CA3AF]">
                Created {relativeTime(experiment.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {experiment.status === "PENDING" && (
            <Button
              onClick={handleProcessAndRun}
              disabled={audioPhase === "processing"}
              className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
            >
              {audioPhase === "processing" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1.5" />
              )}
              Process Audio & Run
            </Button>
          )}
          {experiment.status === "RUNNING" && (
            <Button
              variant="outline"
              onClick={handleCancel}
              className="border-[#EAB308]/30 text-[#EAB308] hover:bg-[#EAB308]/10"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
          {(experiment.status === "COMPLETED" ||
            experiment.status === "FAILED" ||
            experiment.status === "CANCELLED") && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3">
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
      )}

      {audioPhase === "processing" && (
        <Card className="bg-[#0F1D32] border-white/5 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 text-[#3B82F6] animate-spin" />
            <span className="text-sm text-[#F9FAFB]">
              Processing audio files...
            </span>
            <span className="text-xs text-[#9CA3AF] tabular-nums ml-auto">
              {audioProgress.done}/{audioProgress.total}
            </span>
          </div>
          <ProgressBar value={audioProgress.done} max={audioProgress.total} />
        </Card>
      )}

      {audioPhase === "error" && audioError && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3">
          <p className="text-sm text-[#EF4444]">{audioError}</p>
        </div>
      )}

      {(experiment.status === "RUNNING" || experiment.status === "PENDING") && (
        <Card className="bg-[#0F1D32] border-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#F9FAFB]">Task Progress</span>
            <span className="text-xs text-[#9CA3AF] tabular-nums">
              {experiment.doneTasks} / {experiment.totalTasks} tasks
            </span>
          </div>
          <ProgressBar
            value={experiment.doneTasks}
            max={experiment.totalTasks}
          />
          {experiment.status === "RUNNING" && (
            <p className="text-[10px] text-[#9CA3AF] mt-2 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Auto-refreshing every 2 seconds...
            </p>
          )}
        </Card>
      )}

      {experiment.status === "COMPLETED" && winners && (
        <Card className="bg-[#0F1D32] border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-[#EAB308]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">
              Winners
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {winners.lowestWer && (
              <div className="rounded-lg bg-[#10B981]/5 border border-[#10B981]/20 p-3">
                <div className="text-[10px] text-[#10B981] font-medium mb-1">
                  Lowest WER
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(winners.lowestWer.model, winners.lowestWer.provider)} @ {winners.lowestWer.speed}x
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatWer(winners.lowestWer.avgWer)}
                </div>
              </div>
            )}
            {winners.lowestCost && (
              <div className="rounded-lg bg-[#3B82F6]/5 border border-[#3B82F6]/20 p-3">
                <div className="text-[10px] text-[#3B82F6] font-medium mb-1">
                  Lowest Cost
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(winners.lowestCost.model, winners.lowestCost.provider)} @ {winners.lowestCost.speed}x
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatCost(winners.lowestCost.avgCost)}
                </div>
              </div>
            )}
            {winners.fastest && (
              <div className="rounded-lg bg-[#8B5CF6]/5 border border-[#8B5CF6]/20 p-3">
                <div className="text-[10px] text-[#8B5CF6] font-medium mb-1">
                  Fastest
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(winners.fastest.model, winners.fastest.provider)} @ {winners.fastest.speed}x
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatLatency(winners.fastest.avgLatency)}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {grid.length > 0 && (
        <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#3B82F6]" />
              <span className="text-sm font-medium text-[#F9FAFB]">
                Summary Grid
              </span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[#9CA3AF] text-xs">Model</TableHead>
                {gridSpeeds.map((speed) => (
                  <TableHead
                    key={speed}
                    className="text-[#9CA3AF] text-xs text-center"
                    colSpan={1}
                  >
                    {speed}x
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {gridModels.map(({ model, provider }) => (
                <TableRow key={`${model}|${provider}`} className="border-white/5">
                  <TableCell className="text-[#F9FAFB] text-xs font-mono">
                    {qualifiedModel(model, provider)}
                  </TableCell>
                  {gridSpeeds.map((speed) => {
                    const cell = grid.find(
                      (g) => g.model === model && g.provider === provider && g.speed === speed
                    );
                    if (!cell) {
                      return (
                        <TableCell
                          key={speed}
                          className="text-[#9CA3AF] text-xs text-center"
                        >
                          --
                        </TableCell>
                      );
                    }
                    const speedCells = gridBySpeed[speed] || [];
                    const werValues = speedCells
                      .filter((c) => c.avgWer > 0)
                      .map((c) => c.avgWer);
                    const costValues = speedCells
                      .filter((c) => c.avgCost > 0)
                      .map((c) => c.avgCost);
                    const latValues = speedCells
                      .filter((c) => c.avgLatency > 0)
                      .map((c) => c.avgLatency);

                    const werMin = Math.min(...werValues);
                    const werMax = Math.max(...werValues);
                    const costMin = Math.min(...costValues);
                    const costMax = Math.max(...costValues);
                    const latMin = Math.min(...latValues);
                    const latMax = Math.max(...latValues);

                    const isBestWer =
                      werValues.length > 0 &&
                      cell.avgWer === werMin;
                    const isWorstWer =
                      werValues.length > 0 &&
                      werMin !== werMax &&
                      cell.avgWer === werMax;
                    const isBestCost =
                      costValues.length > 0 &&
                      cell.avgCost === costMin;
                    const isWorstCost =
                      costValues.length > 0 &&
                      costMin !== costMax &&
                      cell.avgCost === costMax;
                    const isBestLat =
                      latValues.length > 0 &&
                      cell.avgLatency === latMin;
                    const isWorstLat =
                      latValues.length > 0 &&
                      latMin !== latMax &&
                      cell.avgLatency === latMax;

                    return (
                      <TableCell key={speed} className="text-center">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "text-[10px] font-mono tabular-nums",
                              isBestWer && "text-[#10B981]",
                              isWorstWer && "text-[#EF4444]",
                              !isBestWer && !isWorstWer && "text-[#F9FAFB]"
                            )}
                          >
                            WER: {cell.avgWer > 0 ? formatWer(cell.avgWer) : "--"}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono tabular-nums",
                              isBestCost && "text-[#10B981]",
                              isWorstCost && "text-[#EF4444]",
                              !isBestCost && !isWorstCost && "text-[#9CA3AF]"
                            )}
                          >
                            {cell.avgCost > 0 ? formatCost(cell.avgCost) : "--"}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono tabular-nums",
                              isBestLat && "text-[#10B981]",
                              isWorstLat && "text-[#EF4444]",
                              !isBestLat && !isWorstLat && "text-[#9CA3AF]"
                            )}
                          >
                            {cell.avgLatency > 0
                              ? formatLatency(cell.avgLatency)
                              : "--"}
                          </span>
                          {cell.failedCount > 0 && (
                            <span className="text-[9px] text-[#EF4444]">
                              {cell.failedCount} failed
                            </span>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {Object.keys(resultsByEpisode).length > 0 && (
        <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <span className="text-sm font-medium text-[#F9FAFB]">
              Per-Episode Results
            </span>
          </div>
          <Accordion type="multiple" className="px-4">
            {Object.entries(resultsByEpisode).map(([episodeId, epResults]) => {
              const firstResult = epResults[0];
              const episodeLabel =
                firstResult?.episodeTitle ||
                firstResult?.podcastTitle ||
                episodeId;
              const completedCount = epResults.filter(
                (r) => r.status === "COMPLETED"
              ).length;
              const failedCount = epResults.filter(
                (r) => r.status === "FAILED"
              ).length;

              return (
                <AccordionItem
                  key={episodeId}
                  value={episodeId}
                  className="border-white/5"
                >
                  <AccordionTrigger className="text-[#F9FAFB] text-sm hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 mr-4">
                      <span className="truncate max-w-md">{episodeLabel}</span>
                      <div className="flex items-center gap-2 ml-auto">
                        {completedCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-[#10B981]">
                            <CheckCircle2 className="h-3 w-3" />
                            {completedCount}
                          </span>
                        )}
                        {failedCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-[#EF4444]">
                            <XCircle className="h-3 w-3" />
                            {failedCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Model
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Speed
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Status
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            WER
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Cost
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Latency
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-[10px]">
                            Words
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {epResults.map((r) => (
                          <TableRow
                            key={r.id}
                            className="border-white/5"
                          >
                            <TableCell className="text-[#F9FAFB] text-xs font-mono">
                              {qualifiedModel(r.model, r.provider)}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                              {r.speed}x
                            </TableCell>
                            <TableCell>
                              <ResultStatusBadge status={r.status} />
                            </TableCell>
                            <TableCell className="text-[#F9FAFB] text-xs tabular-nums">
                              {r.wer != null ? formatWer(r.wer) : "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                              {r.costDollars != null
                                ? formatCost(r.costDollars)
                                : "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                              {r.latencyMs != null
                                ? formatLatency(r.latencyMs)
                                : "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                              {r.wordCount ?? "--"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {epResults.some((r) => r.errorMessage) && (
                      <div className="mt-2 space-y-1">
                        {epResults
                          .filter((r) => r.errorMessage)
                          .map((r) => (
                            <div
                              key={r.id}
                              className="text-[10px] text-[#EF4444] bg-[#EF4444]/5 rounded px-2 py-1"
                            >
                              <span className="font-mono">{qualifiedModel(r.model, r.provider)}</span> @{" "}
                              {r.speed}x: {r.errorMessage}
                            </div>
                          ))}
                      </div>
                    )}

                    {epResults.some((r) => r.status === "COMPLETED") && (
                      <div className="mt-3 border-t border-white/5 pt-3">
                        <span className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">
                          Transcripts
                        </span>
                        <EpisodeTranscripts results={epResults} />
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Card>
      )}

      {results.length === 0 && !loading && experiment.status === "PENDING" && (
        <Card className="bg-[#0F1D32] border-white/5 p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <FlaskConical className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">
              Experiment is pending. Click "Process Audio & Run" to start.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
