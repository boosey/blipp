import { useState, useEffect, useCallback, useRef } from "react";
import {
  Scale,
  Plus,
  ArrowLeft,
  Loader2,
  Search,
  Shuffle,
  Trash2,
  XCircle,
  Trophy,
  DollarSign,
  Timer,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAdminFetch } from "@/lib/admin-api";
import type {
  ClaimsExperiment,
  ClaimsExperimentStatus,
  ClaimsBenchmarkResult,
  ClaimsResultsGrid,
  ClaimsEligibleEpisode,
  ClaimsJudgeVerdict,
  ClaimsJudgeHallucination,
  ClaimsJudgeOutput,
  AiModelEntry,
  PaginatedResponse,
} from "@/types/admin";

// ── Helpers ──

function qualifiedModel(model: string, provider: string): string {
  return `${model} (${provider})`;
}

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

function formatCost(dollars: number): string {
  return `$${dollars.toFixed(4)}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Constants ──

interface ModelOption {
  id: string; // "modelId:provider"
  modelId: string;
  provider: string;
  providerLabel: string;
  label: string;
  priceInputPerMToken: number;
  priceOutputPerMToken: number;
}

const STATUS_STYLES: Record<
  ClaimsExperimentStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  JUDGING: { bg: "#8B5CF620", text: "#8B5CF6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
  CANCELLED: { bg: "#EAB30820", text: "#EAB308" },
};

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  COVERED: { bg: "#10B98120", text: "#10B981", label: "Covered" },
  PARTIALLY_COVERED: { bg: "#EAB30820", text: "#EAB308", label: "Partial" },
  MISSING: { bg: "#EF444420", text: "#EF4444", label: "Missing" },
};

const PAGE_SIZE = 20;

// ── Sub-components ──

function ExperimentStatusBadge({ status }: { status: ClaimsExperimentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

function ProgressBar({
  value,
  max,
  className,
  color,
}: {
  value: number;
  max: number;
  className?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-white/10 overflow-hidden",
        className
      )}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color || "#3B82F6" }}
      />
    </div>
  );
}

function VerdictBadge({ status }: { status: string }) {
  const s = VERDICT_STYLES[status] || VERDICT_STYLES.MISSING;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ── Experiments List View ──

function ExperimentsList({
  onSelect,
  onNewExperiment,
}: {
  onSelect: (exp: ClaimsExperiment) => void;
  onNewExperiment: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [experiments, setExperiments] = useState<ClaimsExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ data: ClaimsExperiment[] }>(
        "/claims-benchmark/experiments"
      );
      setExperiments(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiFetch<void>(`/claims-benchmark/experiments/${id}`, {
          method: "DELETE",
        });
        setExperiments((prev) => prev.filter((e) => e.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [apiFetch]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-[#0F1D32] border-white/5 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-[#EF4444]" />
          <p className="text-[#EF4444] text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadExperiments}
            className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Experiments</h2>
          <p className="text-xs text-[#9CA3AF]">
            {experiments.length} experiment{experiments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={onNewExperiment}
          className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Experiment
        </Button>
      </div>

      {experiments.length === 0 ? (
        <Card className="bg-[#0F1D32] border-white/5 p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <Scale className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">No experiments yet</p>
            <p className="text-[#9CA3AF]/60 text-xs">
              Create your first claims benchmark experiment to compare extraction models
            </p>
          </div>
        </Card>
      ) : (
        <Card className="bg-[#0F1D32] border-white/5 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[#9CA3AF] text-xs">Name</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Status</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Models</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-48">
                  Progress
                </TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Created</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((exp) => {
                const isRunning =
                  exp.status === "RUNNING" || exp.status === "JUDGING";
                const isTerminal =
                  exp.status === "COMPLETED" ||
                  exp.status === "FAILED" ||
                  exp.status === "CANCELLED";
                return (
                  <TableRow
                    key={exp.id}
                    className="border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => onSelect(exp)}
                  >
                    <TableCell className="text-[#F9FAFB] font-medium text-sm">
                      {exp.name}
                    </TableCell>
                    <TableCell>
                      <ExperimentStatusBadge status={exp.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {exp.config.models.map((m, i) => (
                          <Badge
                            key={`${m.modelId}-${m.provider}-${i}`}
                            className="bg-white/5 text-[#9CA3AF] text-[9px] font-mono"
                          >
                            {m.modelId}@{m.provider}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={exp.doneTasks}
                            max={exp.totalTasks}
                          />
                          <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                            {exp.doneTasks}/{exp.totalTasks}
                          </span>
                        </div>
                        {(exp.status === "JUDGING" ||
                          exp.status === "COMPLETED") &&
                          exp.totalJudgeTasks > 0 && (
                            <div className="flex items-center gap-2">
                              <ProgressBar
                                value={exp.doneJudgeTasks}
                                max={exp.totalJudgeTasks}
                                color="#8B5CF6"
                              />
                              <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                                {exp.doneJudgeTasks}/{exp.totalJudgeTasks}
                              </span>
                            </div>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#9CA3AF] text-xs">
                      {relativeTime(exp.createdAt)}
                    </TableCell>
                    <TableCell>
                      {isTerminal && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent
                            className="bg-[#0F1D32] border-white/10 text-[#F9FAFB]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete experiment?</AlertDialogTitle>
                              <AlertDialogDescription className="text-[#9CA3AF]">
                                This will permanently delete "{exp.name}" and all
                                associated results and R2 data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
                                onClick={() => handleDelete(exp.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Experiment Setup Dialog (6-step) ──

function ExperimentSetupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exp: ClaimsExperiment) => void;
}) {
  const apiFetch = useAdminFetch();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [baselineModel, setBaselineModel] = useState<string>("");
  const [judgeModel, setJudgeModel] = useState<string>("");
  const [judgeChanged, setJudgeChanged] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState<ClaimsEligibleEpisode[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Models from DB
  const [distillationModels, setDistillationModels] = useState<ModelOption[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [defaultJudge, setDefaultJudge] = useState<string>("");

  // Episode picker
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodePage, setEpisodePage] = useState(1);
  const [episodes, setEpisodes] = useState<ClaimsEligibleEpisode[]>([]);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load models
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingModels(true);
        const [distResp, allResp] = await Promise.all([
          apiFetch<{ data: AiModelEntry[] }>("/ai-models?stage=distillation"),
          apiFetch<{ data: AiModelEntry[] }>("/ai-models"),
        ]);
        if (cancelled) return;

        const toOptions = (models: AiModelEntry[]): ModelOption[] => {
          const opts: ModelOption[] = [];
          for (const m of models) {
            for (const p of m.providers ?? []) {
              opts.push({
                id: `${m.modelId}:${p.provider}`,
                modelId: m.modelId,
                provider: p.provider,
                providerLabel: p.providerLabel,
                label: m.label,
                priceInputPerMToken: p.priceInputPerMToken ?? 0,
                priceOutputPerMToken: p.priceOutputPerMToken ?? 0,
              });
            }
          }
          return opts;
        };

        setDistillationModels(toOptions(distResp.data));
        setAllModels(toOptions(allResp.data));

        // Try to load default judge from config
        try {
          const configResp = await apiFetch<{ data: { value: unknown } }>(
            "/config?key=ai.benchmark.judgeModel"
          );
          if (configResp?.data?.value && typeof configResp.data.value === "string") {
            setDefaultJudge(configResp.data.value);
            setJudgeModel(configResp.data.value);
          }
        } catch {
          // no default judge config
        }
      } catch {
        // keep empty
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load eligible episodes
  const loadEpisodes = useCallback(
    async (search: string, page: number) => {
      try {
        setLoadingEpisodes(true);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (search) params.set("search", search);
        const data = await apiFetch<PaginatedResponse<ClaimsEligibleEpisode>>(
          `/claims-benchmark/eligible-episodes?${params}`
        );
        setEpisodes(data.data);
        setTotalEpisodes(data.total);
      } catch {
        // silently handle
      } finally {
        setLoadingEpisodes(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    if (open) loadEpisodes("", 1);
  }, [open, loadEpisodes]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setEpisodePage(1);
      loadEpisodes(episodeSearch, 1);
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [episodeSearch, loadEpisodes]);

  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleEpisode = (ep: ClaimsEligibleEpisode) => {
    setSelectedEpisodes((prev) =>
      prev.some((e) => e.id === ep.id)
        ? prev.filter((e) => e.id !== ep.id)
        : [...prev, ep]
    );
  };

  const selectRandomEpisodes = () => {
    const available = episodes.filter(
      (ep) => !selectedEpisodes.some((s) => s.id === ep.id)
    );
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const toAdd = shuffled.slice(0, 5);
    setSelectedEpisodes((prev) => [...prev, ...toAdd]);
  };

  // Parse model option from composite ID
  const getModelOption = (id: string, list: ModelOption[]) =>
    list.find((m) => m.id === id);

  // Candidate models = distillation models excluding baseline
  const candidateOptions = distillationModels.filter(
    (m) => m.id !== baselineModel
  );

  // Cost estimate
  const baselineOpt = getModelOption(baselineModel, distillationModels);
  const judgeOpt = getModelOption(judgeModel, allModels);
  const candidateCount = selectedCandidates.length;
  const episodeCount = selectedEpisodes.length;

  const estimateCost = () => {
    if (!episodeCount || !baselineOpt) return { extraction: 0, judging: 0, total: 0 };
    const totalModels = 1 + candidateCount; // baseline + candidates
    const avgTranscriptTokens =
      selectedEpisodes.reduce(
        (sum, ep) => sum + (ep.transcriptSizeBytes ?? 0) / 4,
        0
      ) / episodeCount;

    // Extraction: each model x each episode
    const extractionInputTokens = totalModels * episodeCount * avgTranscriptTokens;
    const extractionOutputTokens = totalModels * episodeCount * 2000; // estimated output
    const extractionCost =
      (extractionInputTokens * (baselineOpt.priceInputPerMToken || 0)) / 1_000_000 +
      (extractionOutputTokens * (baselineOpt.priceOutputPerMToken || 0)) / 1_000_000;

    // Judging: each candidate x each episode
    const judgeInputTokens = candidateCount * episodeCount * 4000; // ~4k tokens per judge call
    const judgeOutputTokens = candidateCount * episodeCount * 1000;
    const judgingCost = judgeOpt
      ? (judgeInputTokens * (judgeOpt.priceInputPerMToken || 0)) / 1_000_000 +
        (judgeOutputTokens * (judgeOpt.priceOutputPerMToken || 0)) / 1_000_000
      : 0;

    return {
      extraction: extractionCost,
      judging: judgingCost,
      total: extractionCost + judgingCost,
    };
  };

  const costs = estimateCost();

  const canCreate =
    name.trim() &&
    baselineModel &&
    judgeModel &&
    selectedCandidates.length > 0 &&
    selectedEpisodes.length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      setCreateError(null);
      const baseline = getModelOption(baselineModel, distillationModels)!;
      const judge = getModelOption(judgeModel, allModels)!;
      const models = [
        { modelId: baseline.modelId, provider: baseline.provider },
        ...selectedCandidates.map((id) => {
          const opt = getModelOption(id, distillationModels)!;
          return { modelId: opt.modelId, provider: opt.provider };
        }),
      ];
      const result = await apiFetch<{ data: ClaimsExperiment }>(
        "/claims-benchmark/experiments",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            baselineModelId: baseline.modelId,
            baselineProvider: baseline.provider,
            judgeModelId: judge.modelId,
            judgeProvider: judge.provider,
            models,
            episodeIds: selectedEpisodes.map((e) => e.id),
          }),
        }
      );
      onCreated(result.data);
      onOpenChange(false);
      // Reset form
      setStep(0);
      setName("");
      setBaselineModel("");
      setJudgeModel(defaultJudge);
      setJudgeChanged(false);
      setSelectedCandidates([]);
      setSelectedEpisodes([]);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create experiment"
      );
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.ceil(totalEpisodes / PAGE_SIZE);

  const STEPS = [
    "Name",
    "Baseline Model",
    "Judge Model",
    "Candidate Models",
    "Episodes",
    "Cost Estimate",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0F1D32] border-white/10 text-[#F9FAFB] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] flex items-center gap-2">
            <Scale className="h-5 w-5 text-[#3B82F6]" />
            New Claims Benchmark Experiment
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Compare claims extraction models against a baseline with LLM-as-judge
            evaluation.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-1">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                i <= step ? "bg-[#3B82F6]" : "bg-white/10"
              )}
              title={s}
            />
          ))}
        </div>
        <p className="text-[10px] text-[#9CA3AF] px-1">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="space-y-6 pb-4">
            {/* Step 0: Name */}
            {step === 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#9CA3AF]">
                  Experiment Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Distillation model comparison Q1 2026"
                  className="bg-white/5 border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50 focus:border-[#3B82F6]/50"
                  autoFocus
                />
              </div>
            )}

            {/* Step 1: Baseline Model */}
            {step === 1 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#9CA3AF]">
                  Baseline Model (reference standard)
                </label>
                {loadingModels && <Skeleton className="h-12 w-full bg-white/5" />}
                <div className="grid grid-cols-2 gap-2">
                  {distillationModels.map((m) => (
                    <label
                      key={m.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        baselineModel === m.id
                          ? "border-[#3B82F6]/50 bg-[#3B82F6]/5"
                          : "border-white/5 hover:border-white/10 bg-white/[0.02]"
                      )}
                    >
                      <input
                        type="radio"
                        name="baseline"
                        checked={baselineModel === m.id}
                        onChange={() => {
                          setBaselineModel(m.id);
                          // Remove from candidates if selected
                          setSelectedCandidates((prev) =>
                            prev.filter((c) => c !== m.id)
                          );
                        }}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          baselineModel === m.id
                            ? "border-[#3B82F6]"
                            : "border-white/20"
                        )}
                      >
                        {baselineModel === m.id && (
                          <div className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm text-[#F9FAFB]">{m.label}</div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          {m.providerLabel}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF] font-mono">
                          ${m.priceInputPerMToken}/M input
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Judge Model */}
            {step === 2 && (
              <div className="space-y-3">
                <label className="text-xs font-medium text-[#9CA3AF]">
                  Judge Model (evaluates candidate claims against baseline)
                </label>
                {judgeChanged && (
                  <div className="rounded-md bg-[#EAB308]/10 border border-[#EAB308]/20 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#EAB308] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#EAB308]">
                      Changing the judge model may make results incomparable with
                      previous experiments.
                    </p>
                  </div>
                )}
                {loadingModels && <Skeleton className="h-12 w-full bg-white/5" />}
                <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                  {allModels.map((m) => (
                    <label
                      key={m.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        judgeModel === m.id
                          ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/5"
                          : "border-white/5 hover:border-white/10 bg-white/[0.02]"
                      )}
                    >
                      <input
                        type="radio"
                        name="judge"
                        checked={judgeModel === m.id}
                        onChange={() => {
                          setJudgeModel(m.id);
                          if (m.id !== defaultJudge) setJudgeChanged(true);
                          else setJudgeChanged(false);
                        }}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          judgeModel === m.id
                            ? "border-[#8B5CF6]"
                            : "border-white/20"
                        )}
                      >
                        {judgeModel === m.id && (
                          <div className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm text-[#F9FAFB]">{m.label}</div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          {m.providerLabel}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF] font-mono">
                          ${m.priceInputPerMToken}/M input &middot; $
                          {m.priceOutputPerMToken}/M output
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Candidate Models */}
            {step === 3 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#9CA3AF]">
                  Candidate Models ({selectedCandidates.length} selected)
                </label>
                {!baselineModel && (
                  <p className="text-xs text-[#EAB308]">
                    Select a baseline model first.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {candidateOptions.map((m) => (
                    <label
                      key={m.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        selectedCandidates.includes(m.id)
                          ? "border-[#3B82F6]/50 bg-[#3B82F6]/5"
                          : "border-white/5 hover:border-white/10 bg-white/[0.02]"
                      )}
                    >
                      <Checkbox
                        checked={selectedCandidates.includes(m.id)}
                        onCheckedChange={() => toggleCandidate(m.id)}
                      />
                      <div>
                        <div className="text-sm text-[#F9FAFB]">{m.label}</div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          {m.providerLabel}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF] font-mono">
                          ${m.priceInputPerMToken}/M input &middot; $
                          {m.priceOutputPerMToken}/M output
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Episodes */}
            {step === 4 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#9CA3AF]">
                    Episodes ({selectedEpisodes.length} selected)
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectRandomEpisodes}
                    disabled={episodes.length === 0}
                    className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 text-xs h-7"
                  >
                    <Shuffle className="h-3 w-3 mr-1" />
                    Select 5 Random
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#9CA3AF]" />
                  <Input
                    value={episodeSearch}
                    onChange={(e) => setEpisodeSearch(e.target.value)}
                    placeholder="Search episodes..."
                    className="bg-white/5 border-white/10 pl-9 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/50 focus:border-[#3B82F6]/50"
                  />
                </div>

                {/* Selected episode chips */}
                {selectedEpisodes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedEpisodes.map((ep) => (
                      <Badge
                        key={ep.id}
                        className="bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] cursor-pointer hover:bg-[#3B82F6]/20 transition-colors"
                        onClick={() => toggleEpisode(ep)}
                      >
                        {ep.title.slice(0, 40)}
                        {ep.title.length > 40 ? "..." : ""}
                        <XCircle className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}

                <Card className="bg-[#0A1628] border-white/5 overflow-hidden">
                  <ScrollArea className="h-56">
                    {loadingEpisodes ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full bg-white/5" />
                        ))}
                      </div>
                    ) : episodes.length === 0 ? (
                      <div className="p-8 text-center text-[#9CA3AF] text-xs">
                        No eligible episodes found (need transcript work product)
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="text-[#9CA3AF] text-[10px] w-8" />
                            <TableHead className="text-[#9CA3AF] text-[10px]">
                              Podcast
                            </TableHead>
                            <TableHead className="text-[#9CA3AF] text-[10px]">
                              Episode
                            </TableHead>
                            <TableHead className="text-[#9CA3AF] text-[10px]">
                              Duration
                            </TableHead>
                            <TableHead className="text-[#9CA3AF] text-[10px]">
                              Transcript
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {episodes.map((ep) => {
                            const isSelected = selectedEpisodes.some(
                              (s) => s.id === ep.id
                            );
                            return (
                              <TableRow
                                key={ep.id}
                                className={cn(
                                  "border-white/5 cursor-pointer transition-colors",
                                  isSelected
                                    ? "bg-[#3B82F6]/5"
                                    : "hover:bg-white/[0.02]"
                                )}
                                onClick={() => toggleEpisode(ep)}
                              >
                                <TableCell>
                                  <Checkbox checked={isSelected} />
                                </TableCell>
                                <TableCell className="text-[#9CA3AF] text-xs max-w-40 truncate">
                                  {ep.podcastTitle}
                                </TableCell>
                                <TableCell className="text-[#F9FAFB] text-xs max-w-60 truncate">
                                  {ep.title}
                                </TableCell>
                                <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                                  {formatDuration(ep.durationSeconds)}
                                </TableCell>
                                <TableCell className="text-[#9CA3AF] text-xs tabular-nums">
                                  {formatBytes(ep.transcriptSizeBytes)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </ScrollArea>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
                      <span className="text-[10px] text-[#9CA3AF]">
                        Page {episodePage} of {totalPages} ({totalEpisodes} total)
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={episodePage <= 1}
                          onClick={() => {
                            const p = episodePage - 1;
                            setEpisodePage(p);
                            loadEpisodes(episodeSearch, p);
                          }}
                          className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                        >
                          Prev
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={episodePage >= totalPages}
                          onClick={() => {
                            const p = episodePage + 1;
                            setEpisodePage(p);
                            loadEpisodes(episodeSearch, p);
                          }}
                          className="h-6 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Step 5: Cost Estimate */}
            {step === 5 && (
              <div className="space-y-4">
                <Card className="bg-[#0A1628] border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[#10B981]" />
                    <span className="text-xs font-medium text-[#9CA3AF]">
                      Cost Estimate
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md bg-white/[0.02] border border-white/5 px-3 py-2">
                      <span className="text-xs text-[#9CA3AF]">
                        Extraction ({1 + candidateCount} models x {episodeCount}{" "}
                        episodes)
                      </span>
                      <span className="text-xs text-[#F9FAFB] font-mono tabular-nums">
                        {formatCost(costs.extraction)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-white/[0.02] border border-white/5 px-3 py-2">
                      <span className="text-xs text-[#9CA3AF]">
                        Judging ({candidateCount} candidates x {episodeCount}{" "}
                        episodes)
                      </span>
                      <span className="text-xs text-[#F9FAFB] font-mono tabular-nums">
                        {formatCost(costs.judging)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-xs text-[#9CA3AF]">
                      {(1 + candidateCount) * episodeCount} extraction tasks +{" "}
                      {candidateCount * episodeCount} judge tasks
                    </span>
                    <span className="text-sm font-semibold text-[#10B981] tabular-nums">
                      {formatCost(costs.total)}
                    </span>
                  </div>
                </Card>

                {/* Summary */}
                <Card className="bg-[#0A1628] border-white/5 p-4 space-y-2">
                  <span className="text-xs font-medium text-[#9CA3AF]">
                    Summary
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-[#9CA3AF]">Name:</div>
                    <div className="text-[#F9FAFB]">{name || "--"}</div>
                    <div className="text-[#9CA3AF]">Baseline:</div>
                    <div className="text-[#F9FAFB] font-mono">
                      {baselineOpt
                        ? qualifiedModel(baselineOpt.modelId, baselineOpt.provider)
                        : "--"}
                    </div>
                    <div className="text-[#9CA3AF]">Judge:</div>
                    <div className="text-[#F9FAFB] font-mono">
                      {judgeOpt
                        ? qualifiedModel(judgeOpt.modelId, judgeOpt.provider)
                        : "--"}
                    </div>
                    <div className="text-[#9CA3AF]">Candidates:</div>
                    <div className="text-[#F9FAFB]">
                      {selectedCandidates.length} model
                      {selectedCandidates.length !== 1 ? "s" : ""}
                    </div>
                    <div className="text-[#9CA3AF]">Episodes:</div>
                    <div className="text-[#F9FAFB]">
                      {selectedEpisodes.length} episode
                      {selectedEpisodes.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Error */}
            {createError && (
              <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-3 py-2">
                <p className="text-xs text-[#EF4444]">{createError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <Button
            variant="outline"
            onClick={() => (step > 0 ? setStep(step - 1) : onOpenChange(false))}
            className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            {step > 0 ? "Back" : "Cancel"}
          </Button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 0 && !name.trim()) ||
                  (step === 1 && !baselineModel) ||
                  (step === 2 && !judgeModel) ||
                  (step === 3 && selectedCandidates.length === 0) ||
                  (step === 4 && selectedEpisodes.length === 0)
                }
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                disabled={!canCreate || creating}
                onClick={handleCreate}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Scale className="h-4 w-4 mr-1.5" />
                )}
                Create Experiment
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Results Dashboard ──

function ResultsDashboard({
  experiment: initialExperiment,
  onBack,
}: {
  experiment: ClaimsExperiment;
  onBack: () => void;
}) {
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
              <ExperimentStatusBadge status={experiment.status} />
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

// ── Episode Verdict View ──

function EpisodeVerdictView({
  episodeId,
  baseline,
  candidates,
}: {
  episodeId: string;
  baseline: ClaimsBenchmarkResult | null;
  candidates: ClaimsBenchmarkResult[];
}) {
  const apiFetch = useAdminFetch();
  const [baselineClaims, setBaselineClaims] = useState<any[] | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(
    candidates[0]?.id ?? null
  );
  const [candidateClaims, setCandidateClaims] = useState<any[] | null>(null);
  const [verdicts, setVerdicts] = useState<ClaimsJudgeOutput | null>(null);
  const [loading, setLoading] = useState(false);

  // Load baseline claims
  useEffect(() => {
    if (!baseline?.id || baseline.status !== "COMPLETED") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ data: { claims: any[] } }>(
          `/claims-benchmark/results/${baseline.id}/claims`
        );
        if (!cancelled) setBaselineClaims(data.data.claims);
      } catch {
        // silently handle
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseline?.id, baseline?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load candidate claims and verdicts when selected
  useEffect(() => {
    if (!selectedCandidate) return;
    const candidate = candidates.find((c) => c.id === selectedCandidate);
    if (!candidate || candidate.status !== "COMPLETED") return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [claimsResp, verdictsResp] = await Promise.all([
          apiFetch<{ data: { claims: any[] } }>(
            `/claims-benchmark/results/${selectedCandidate}/claims`
          ),
          candidate.judgeStatus === "COMPLETED"
            ? apiFetch<{ data: ClaimsJudgeOutput }>(
                `/claims-benchmark/results/${selectedCandidate}/verdicts`
              )
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCandidateClaims(claimsResp.data.claims);
        if (verdictsResp) setVerdicts(verdictsResp.data);
        else setVerdicts(null);
      } catch {
        // silently handle
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCandidate]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCandidates = candidates.filter(
    (c) => c.status === "COMPLETED"
  );

  return (
    <div className="space-y-3">
      {/* Candidate selector */}
      {completedCandidates.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#9CA3AF]">Compare with:</span>
          <div className="flex gap-1">
            {completedCandidates.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCandidate(c.id)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                  selectedCandidate === c.id
                    ? "bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30"
                    : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-white/5"
                )}
              >
                {qualifiedModel(c.model, c.provider)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[#3B82F6]" />
          <span className="text-xs text-[#9CA3AF]">Loading claims...</span>
        </div>
      )}

      {/* Side-by-side view */}
      {baselineClaims && !loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Baseline claims (left) */}
          <div>
            <h4 className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">
              Baseline Claims ({baselineClaims.length})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {baselineClaims
                .sort(
                  (a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0)
                )
                .map((claim: any, idx: number) => {
                  const verdict = verdicts?.verdicts.find(
                    (v) => v.baselineIndex === idx
                  );
                  return (
                    <div
                      key={idx}
                      className="rounded-md bg-white/[0.02] border border-white/5 p-2.5 space-y-1"
                    >
                      <div className="flex items-start gap-2">
                        <Badge className="bg-[#3B82F6]/10 text-[#3B82F6] text-[9px] shrink-0">
                          {claim.importance ?? "?"}
                        </Badge>
                        {verdict && <VerdictBadge status={verdict.status} />}
                        <span className="text-xs text-[#F9FAFB]">
                          {claim.claim}
                        </span>
                      </div>
                      {claim.speaker && (
                        <p className="text-[10px] text-[#9CA3AF] pl-7">
                          Speaker: {claim.speaker}
                        </p>
                      )}
                      {verdict?.reason && (
                        <p className="text-[10px] text-[#9CA3AF]/70 pl-7 italic">
                          {verdict.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Candidate claims (right) */}
          <div>
            <h4 className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider mb-2">
              Candidate Claims ({candidateClaims?.length ?? 0})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {candidateClaims?.map((claim: any, idx: number) => {
                const isHallucination = verdicts?.hallucinations.some(
                  (h) => h.candidateIndex === idx
                );
                const hallucination = verdicts?.hallucinations.find(
                  (h) => h.candidateIndex === idx
                );
                const matchedVerdict = verdicts?.verdicts.find(
                  (v) => v.matchedCandidateIndex === idx
                );

                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-md border p-2.5 space-y-1",
                      isHallucination
                        ? "bg-[#F59E0B]/5 border-[#F59E0B]/20"
                        : "bg-white/[0.02] border-white/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isHallucination && (
                        <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] text-[9px] shrink-0">
                          Hallucination
                        </Badge>
                      )}
                      {matchedVerdict && (
                        <VerdictBadge status={matchedVerdict.status} />
                      )}
                      <span className="text-xs text-[#F9FAFB]">
                        {claim.claim}
                      </span>
                    </div>
                    {claim.speaker && (
                      <p className="text-[10px] text-[#9CA3AF] pl-7">
                        Speaker: {claim.speaker}
                      </p>
                    )}
                    {hallucination?.reason && (
                      <p className="text-[10px] text-[#F59E0B]/70 pl-7 italic">
                        {hallucination.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Error messages */}
      {candidates.some((c) => c.errorMessage) && (
        <div className="space-y-1 mt-2">
          {candidates
            .filter((c) => c.errorMessage)
            .map((c) => (
              <div
                key={c.id}
                className="text-[10px] text-[#EF4444] bg-[#EF4444]/5 rounded px-2 py-1"
              >
                <span className="font-mono">
                  {qualifiedModel(c.model, c.provider)}
                </span>
                : {c.errorMessage}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page Component ──

type View =
  | { type: "list" }
  | { type: "results"; experiment: ClaimsExperiment };

export default function ClaimsBenchmark() {
  const [view, setView] = useState<View>({ type: "list" });
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <div className="space-y-6">
      {view.type === "list" && (
        <>
          <ExperimentsList
            onSelect={(exp) => setView({ type: "results", experiment: exp })}
            onNewExperiment={() => setSetupOpen(true)}
          />
          <ExperimentSetupDialog
            open={setupOpen}
            onOpenChange={setSetupOpen}
            onCreated={(exp) => setView({ type: "results", experiment: exp })}
          />
        </>
      )}

      {view.type === "results" && (
        <ResultsDashboard
          experiment={view.experiment}
          onBack={() => setView({ type: "list" })}
        />
      )}
    </div>
  );
}
