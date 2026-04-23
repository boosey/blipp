import { useState, useEffect, useCallback, useRef } from "react";
import {
  Scale,
  ArrowLeft,
  Loader2,
  Trash2,
  XCircle,
  Trophy,
  BarChart3,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { useAdminFetch } from "@/lib/api-client";
import { StatusBadge } from "@/components/admin/status-badge";
import { ProgressBar } from "@/components/admin/progress-bar";
import {
  relativeTime,
  formatCost,
  formatLatency,
  formatPercent,
} from "@/lib/admin-formatters";
import { STATUS_STYLES } from "@/components/admin/claims-benchmark/experiments-list";
import { EpisodeVerdictView } from "@/components/admin/claims-benchmark/episode-verdict-view";
import type {
  ClaimsExperiment,
  ClaimsBenchmarkResult,
  ClaimsResultsGrid,
} from "@/types/admin";

// ── Helpers ──

function qualifiedModel(model: string, provider: string): string {
  return `${model} (${provider})`;
}

// ── Props ──

export interface ResultsDashboardProps {
  experiment: ClaimsExperiment;
  onBack: () => void;
}

// ── Component ──

export function ResultsDashboard({
  experiment: initialExperiment,
  onBack,
}: ResultsDashboardProps) {
  const apiFetch = useAdminFetch();

  const [experiment, setExperiment] = useState<ClaimsExperiment>(initialExperiment);
  const [results, setResults] = useState<ClaimsBenchmarkResult[]>([]);
  const [grid, setGrid] = useState<ClaimsResultsGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "episodes" | "model">(
    "summary"
  );
  const [selectedModel, setSelectedModel] = useState<{
    model: string;
    provider: string;
  } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch results
  const loadResults = useCallback(async () => {
    try {
      const data = await apiFetch<{
        data: {
          experiment: ClaimsExperiment;
          results: ClaimsBenchmarkResult[];
          grid: ClaimsResultsGrid[];
        };
      }>(`/claims-benchmark/experiments/${experiment.id}/results`);
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

  // Drive tasks + poll when running
  const runNextAndPoll = useCallback(async () => {
    try {
      const res = await apiFetch<{ done: boolean; phase: string }>(
        `/claims-benchmark/experiments/${experiment.id}/run`,
        { method: "POST" }
      );
      if (res.done) {
        await loadResults();
        return;
      }
    } catch (err) {
      console.error("runNext error:", err instanceof Error ? err.message : err);
    }
    await loadResults();
  }, [apiFetch, experiment.id, loadResults]);

  const shouldPoll =
    experiment.status === "RUNNING" ||
    experiment.status === "JUDGING" ||
    experiment.status === "PENDING";

  useEffect(() => {
    if (
      shouldPoll &&
      experiment.status !== "PENDING"
    ) {
      pollRef.current = setInterval(runNextAndPoll, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [shouldPoll, experiment.status, runNextAndPoll]);

  // Start experiment
  const startRun = useCallback(async () => {
    try {
      await apiFetch<{ done: boolean }>(
        `/claims-benchmark/experiments/${experiment.id}/run`,
        { method: "POST" }
      );
      // Refresh experiment to get new status, then polling kicks in
      await loadResults();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start experiment"
      );
    }
  }, [apiFetch, experiment.id, loadResults]);

  // Cancel
  const handleCancel = async () => {
    try {
      await apiFetch<void>(
        `/claims-benchmark/experiments/${experiment.id}/cancel`,
        { method: "POST" }
      );
      await loadResults();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel experiment"
      );
    }
  };

  // Delete
  const handleDelete = async () => {
    try {
      await apiFetch<void>(`/claims-benchmark/experiments/${experiment.id}`, {
        method: "DELETE",
      });
      onBack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete experiment"
      );
    }
  };

  // Compute winners from grid (excluding baseline)
  const computeWinners = (g: ClaimsResultsGrid[]) => {
    const completed = g.filter((r) => r.completedCount > 0);
    if (completed.length === 0) return null;

    const withCoverage = completed.filter((r) => r.avgCoverage > 0);
    const withCost = completed.filter((r) => r.avgCost > 0);
    const withLatency = completed.filter((r) => r.avgLatency > 0);

    const bestCoverage =
      withCoverage.length > 0
        ? withCoverage.reduce((a, b) => (a.avgCoverage > b.avgCoverage ? a : b))
        : null;
    const lowestCost =
      withCost.length > 0
        ? withCost.reduce((a, b) => (a.avgCost < b.avgCost ? a : b))
        : null;
    const fastest =
      withLatency.length > 0
        ? withLatency.reduce((a, b) => (a.avgLatency < b.avgLatency ? a : b))
        : null;
    const bestValue =
      withCoverage.length > 0 && withCost.length > 0
        ? completed
            .filter((r) => r.avgCost > 0 && r.avgCoverage > 0)
            .reduce((a, b) =>
              a.avgCoverage / a.avgCost > b.avgCoverage / b.avgCost ? a : b
            )
        : null;

    return { bestCoverage, lowestCost, fastest, bestValue };
  };

  const winners = computeWinners(grid);

  // Group results by episode
  const resultsByEpisode = results.reduce(
    (acc, r) => {
      if (!acc[r.episodeId]) acc[r.episodeId] = [];
      acc[r.episodeId].push(r);
      return acc;
    },
    {} as Record<string, ClaimsBenchmarkResult[]>
  );

  // Find baseline results
  const baselineResults = results.filter((r) => r.isBaseline);

  // Grid for baseline
  const baselineGridRow: ClaimsResultsGrid | null =
    baselineResults.length > 0
      ? {
          model: baselineResults[0].model,
          provider: baselineResults[0].provider,
          avgCoverage: 100,
          avgWeightedCoverage: 100,
          avgHallucinations: 0,
          avgClaimCount:
            baselineResults.reduce((s, r) => s + (r.claimCount ?? 0), 0) /
            baselineResults.filter((r) => r.claimCount != null).length || 0,
          avgCost:
            baselineResults.reduce((s, r) => s + (r.costDollars ?? 0), 0) /
            baselineResults.filter((r) => r.costDollars != null).length || 0,
          avgLatency:
            baselineResults.reduce((s, r) => s + (r.latencyMs ?? 0), 0) /
            baselineResults.filter((r) => r.latencyMs != null).length || 0,
          completedCount: baselineResults.filter((r) => r.status === "COMPLETED")
            .length,
          failedCount: baselineResults.filter((r) => r.status === "FAILED").length,
        }
      : null;

  // Model drill-down data
  const modelResults = selectedModel
    ? results.filter(
        (r) =>
          r.model === selectedModel.model &&
          r.provider === selectedModel.provider &&
          !r.isBaseline
      )
    : [];

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
              onClick={startRun}
              className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
            >
              <Scale className="h-4 w-4 mr-1.5" />
              Start Run
            </Button>
          )}
          {(experiment.status === "RUNNING" ||
            experiment.status === "JUDGING") && (
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#0F1D32] border-white/10 text-[#F9FAFB]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete experiment?</AlertDialogTitle>
                  <AlertDialogDescription className="text-[#9CA3AF]">
                    This will permanently delete this experiment and all results.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3">
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
      )}
      {experiment.errorMessage && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3">
          <p className="text-sm text-[#EF4444]">{experiment.errorMessage}</p>
        </div>
      )}

      {/* Progress Section */}
      {(experiment.status === "RUNNING" ||
        experiment.status === "JUDGING" ||
        experiment.status === "PENDING") && (
        <Card className="bg-[#0F1D32] border-white/5 p-4 space-y-3">
          {/* Extraction progress */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-[#F9FAFB] flex items-center gap-1.5">
                {experiment.status === "RUNNING" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#3B82F6]" />
                )}
                {experiment.status === "RUNNING"
                  ? "Extracting claims..."
                  : "Extraction"}
                {experiment.status !== "RUNNING" &&
                  experiment.doneTasks === experiment.totalTasks && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                  )}
              </span>
              <span className="text-xs text-[#9CA3AF] tabular-nums">
                {experiment.doneTasks} / {experiment.totalTasks}
              </span>
            </div>
            <ProgressBar
              value={experiment.doneTasks}
              max={experiment.totalTasks}
            />
          </div>

          {/* Judging progress */}
          {(experiment.status === "JUDGING" ||
            (experiment.totalJudgeTasks > 0 &&
              experiment.doneTasks === experiment.totalTasks)) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-[#F9FAFB] flex items-center gap-1.5">
                  {experiment.status === "JUDGING" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8B5CF6]" />
                  )}
                  {experiment.status === "JUDGING"
                    ? "Judging candidates..."
                    : "Judging"}
                </span>
                <span className="text-xs text-[#9CA3AF] tabular-nums">
                  {experiment.doneJudgeTasks} / {experiment.totalJudgeTasks}
                </span>
              </div>
              <ProgressBar
                value={experiment.doneJudgeTasks}
                max={experiment.totalJudgeTasks}
                color="#8B5CF6"
              />
            </div>
          )}

          {(experiment.status === "RUNNING" ||
            experiment.status === "JUDGING") && (
            <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Auto-refreshing every 2 seconds...
            </p>
          )}
        </Card>
      )}

      {/* Winner Banner */}
      {experiment.status === "COMPLETED" && winners && (
        <Card className="bg-[#0F1D32] border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-[#EAB308]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Winners</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {winners.bestCoverage && (
              <div className="rounded-lg bg-[#10B981]/5 border border-[#10B981]/20 p-3">
                <div className="text-[10px] text-[#10B981] font-medium mb-1">
                  Best Coverage
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(
                    winners.bestCoverage.model,
                    winners.bestCoverage.provider
                  )}
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatPercent(winners.bestCoverage.avgCoverage)}
                </div>
              </div>
            )}
            {winners.lowestCost && (
              <div className="rounded-lg bg-[#3B82F6]/5 border border-[#3B82F6]/20 p-3">
                <div className="text-[10px] text-[#3B82F6] font-medium mb-1">
                  Lowest Cost
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(
                    winners.lowestCost.model,
                    winners.lowestCost.provider
                  )}
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
                  {qualifiedModel(
                    winners.fastest.model,
                    winners.fastest.provider
                  )}
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatLatency(winners.fastest.avgLatency)}
                </div>
              </div>
            )}
            {winners.bestValue && (
              <div className="rounded-lg bg-[#F59E0B]/5 border border-[#F59E0B]/20 p-3">
                <div className="text-[10px] text-[#F59E0B] font-medium mb-1">
                  Best Value
                </div>
                <div className="text-sm text-[#F9FAFB] font-mono">
                  {qualifiedModel(
                    winners.bestValue.model,
                    winners.bestValue.provider
                  )}
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatPercent(winners.bestValue.avgCoverage)} @{" "}
                  {formatCost(winners.bestValue.avgCost)}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      {(experiment.status === "COMPLETED" ||
        experiment.status === "JUDGING" ||
        results.length > 0) && (
        <>
          <div className="flex items-center gap-1 border-b border-white/5">
            {(
              [
                { key: "summary", label: "Summary Grid", icon: BarChart3 },
                { key: "episodes", label: "Episode Detail", icon: Eye },
                { key: "model", label: "Per-Model", icon: Scale },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-[1px]",
                  activeTab === tab.key
                    ? "border-[#3B82F6] text-[#3B82F6]"
                    : "border-transparent text-[#9CA3AF] hover:text-[#F9FAFB]"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Summary Grid Tab */}
          {activeTab === "summary" && (
            <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-[#9CA3AF] text-xs">
                      Model
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs">
                      Provider
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Avg Coverage
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Weighted Cov.
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Hallucinations
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Claims
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Avg Cost
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Avg Latency
                    </TableHead>
                    <TableHead className="text-[#9CA3AF] text-xs text-right">
                      Done/Fail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Baseline row (pinned) */}
                  {baselineGridRow && (
                    <TableRow className="border-white/5 bg-white/[0.02]">
                      <TableCell className="text-[#9CA3AF] text-xs font-mono">
                        {baselineGridRow.model}
                        <Badge className="ml-2 bg-[#10B981]/10 text-[#10B981] text-[8px]">
                          Baseline
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs">
                        {baselineGridRow.provider}
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        --
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        --
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        --
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        {baselineGridRow.avgClaimCount > 0
                          ? baselineGridRow.avgClaimCount.toFixed(1)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        {baselineGridRow.avgCost > 0
                          ? formatCost(baselineGridRow.avgCost)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        {baselineGridRow.avgLatency > 0
                          ? formatLatency(baselineGridRow.avgLatency)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                        {baselineGridRow.completedCount}/
                        {baselineGridRow.failedCount}
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Candidate rows sorted by coverage desc */}
                  {[...grid]
                    .sort((a, b) => b.avgCoverage - a.avgCoverage)
                    .map((row) => {
                      const bestCoverage =
                        grid.length > 0
                          ? Math.max(...grid.map((g) => g.avgCoverage))
                          : 0;
                      const isBestCoverage =
                        row.avgCoverage > 0 &&
                        row.avgCoverage === bestCoverage;

                      return (
                        <TableRow
                          key={`${row.model}|${row.provider}`}
                          className="border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() =>
                            setSelectedModel({
                              model: row.model,
                              provider: row.provider,
                            })
                          }
                        >
                          <TableCell className="text-[#F9FAFB] text-xs font-mono">
                            {row.model}
                          </TableCell>
                          <TableCell className="text-[#9CA3AF] text-xs">
                            {row.provider}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-xs text-right tabular-nums",
                              isBestCoverage
                                ? "text-[#10B981] font-semibold"
                                : "text-[#F9FAFB]"
                            )}
                          >
                            {row.avgCoverage > 0
                              ? formatPercent(row.avgCoverage)
                              : "--"}
                          </TableCell>
                          <TableCell className="text-[#F9FAFB] text-xs text-right tabular-nums">
                            {row.avgWeightedCoverage > 0
                              ? formatPercent(row.avgWeightedCoverage)
                              : "--"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-xs text-right tabular-nums",
                              row.avgHallucinations > 1
                                ? "text-[#EF4444]"
                                : "text-[#F9FAFB]"
                            )}
                          >
                            {row.avgHallucinations.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                            {row.avgClaimCount.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                            {row.avgCost > 0 ? formatCost(row.avgCost) : "--"}
                          </TableCell>
                          <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                            {row.avgLatency > 0
                              ? formatLatency(row.avgLatency)
                              : "--"}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            <span className="text-[#10B981]">
                              {row.completedCount}
                            </span>
                            /
                            <span className="text-[#EF4444]">
                              {row.failedCount}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Episode Detail Tab */}
          {activeTab === "episodes" && (
            <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
              <Accordion type="multiple" className="px-4">
                {Object.entries(resultsByEpisode).map(
                  ([episodeId, epResults]) => {
                    const firstResult = epResults[0];
                    const episodeLabel =
                      firstResult?.episodeTitle ||
                      firstResult?.podcastTitle ||
                      episodeId;
                    const baseline = epResults.find((r) => r.isBaseline);
                    const candidates = epResults.filter((r) => !r.isBaseline);

                    return (
                      <AccordionItem
                        key={episodeId}
                        value={episodeId}
                        className="border-white/5"
                      >
                        <AccordionTrigger className="text-[#F9FAFB] text-sm hover:no-underline">
                          <div className="flex items-center gap-3 flex-1 mr-4">
                            <span className="truncate max-w-md">
                              {episodeLabel}
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                              {baseline?.status === "COMPLETED" && (
                                <span className="text-[10px] text-[#9CA3AF]">
                                  {baseline.claimCount} baseline claims
                                </span>
                              )}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <EpisodeVerdictView
                            episodeId={episodeId}
                            baseline={baseline ?? null}
                            candidates={candidates}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    );
                  }
                )}
              </Accordion>
            </Card>
          )}

          {/* Per-Model Drill-Down Tab */}
          {activeTab === "model" && (
            <div className="space-y-4">
              {!selectedModel ? (
                <Card className="bg-[#0F1D32] border-white/5 p-8">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Scale className="h-8 w-8 text-[#9CA3AF]/40" />
                    <p className="text-[#9CA3AF] text-sm">
                      Click a model row in the Summary Grid to see per-episode
                      breakdown
                    </p>
                  </div>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedModel(null)}
                      className="text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                    </Button>
                    <h3 className="text-sm font-medium text-[#F9FAFB] font-mono">
                      {qualifiedModel(
                        selectedModel.model,
                        selectedModel.provider
                      )}
                    </h3>
                  </div>
                  <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-[#9CA3AF] text-xs">
                            Episode
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Coverage
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Weighted
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Halluc.
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Claims
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Cost
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs text-right">
                            Latency
                          </TableHead>
                          <TableHead className="text-[#9CA3AF] text-xs">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelResults.map((r) => (
                          <TableRow
                            key={r.id}
                            className={cn(
                              "border-white/5",
                              r.coverageScore != null &&
                                r.coverageScore < 50 &&
                                "bg-[#EF4444]/5"
                            )}
                          >
                            <TableCell className="text-[#F9FAFB] text-xs max-w-60 truncate">
                              {r.episodeTitle || r.episodeId}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-xs text-right tabular-nums",
                                r.coverageScore != null && r.coverageScore < 50
                                  ? "text-[#EF4444]"
                                  : r.coverageScore != null &&
                                      r.coverageScore >= 90
                                    ? "text-[#10B981]"
                                    : "text-[#F9FAFB]"
                              )}
                            >
                              {r.coverageScore != null
                                ? formatPercent(r.coverageScore)
                                : "--"}
                            </TableCell>
                            <TableCell className="text-[#F9FAFB] text-xs text-right tabular-nums">
                              {r.weightedCoverageScore != null
                                ? formatPercent(r.weightedCoverageScore)
                                : "--"}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-xs text-right tabular-nums",
                                r.hallucinations != null && r.hallucinations > 0
                                  ? "text-[#F59E0B]"
                                  : "text-[#9CA3AF]"
                              )}
                            >
                              {r.hallucinations ?? "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                              {r.claimCount ?? "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                              {r.costDollars != null
                                ? formatCost(r.costDollars)
                                : "--"}
                            </TableCell>
                            <TableCell className="text-[#9CA3AF] text-xs text-right tabular-nums">
                              {r.latencyMs != null
                                ? formatLatency(r.latencyMs)
                                : "--"}
                            </TableCell>
                            <TableCell>
                              {r.judgeStatus && (
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
                                    r.judgeStatus === "COMPLETED" &&
                                      "bg-[#10B981]/20 text-[#10B981]",
                                    r.judgeStatus === "FAILED" &&
                                      "bg-[#EF4444]/20 text-[#EF4444]",
                                    r.judgeStatus === "PENDING" &&
                                      "bg-[#9CA3AF]/20 text-[#9CA3AF]",
                                    r.judgeStatus === "RUNNING" &&
                                      "bg-[#3B82F6]/20 text-[#3B82F6]"
                                  )}
                                >
                                  {r.judgeStatus}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {results.length === 0 && !loading && experiment.status === "PENDING" && (
        <Card className="bg-[#0F1D32] border-white/5 p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <Scale className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">
              Experiment is pending. Click "Start Run" to begin.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
