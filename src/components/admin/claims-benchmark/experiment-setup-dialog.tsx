import { useState, useEffect, useCallback, useRef } from "react";
import {
  Scale,
  Loader2,
  Search,
  Shuffle,
  XCircle,
  AlertTriangle,
  DollarSign,
  ChevronRight,
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
import { Card } from "@/components/ui/card";
import { useAdminFetch } from "@/lib/admin-api";
import { formatCost, formatDurationSec, formatBytes } from "@/lib/admin-formatters";
import type {
  ClaimsExperiment,
  ClaimsEligibleEpisode,
  AiModelEntry,
  PaginatedResponse,
} from "@/types/admin";

// ── Types ──

export interface ModelOption {
  id: string; // "modelId:provider"
  modelId: string;
  provider: string;
  providerLabel: string;
  label: string;
  priceInputPerMToken: number;
  priceOutputPerMToken: number;
}

// ── Helpers ──

function qualifiedModel(model: string, provider: string): string {
  return `${model} (${provider})`;
}

const PAGE_SIZE = 20;

// ── Props ──

export interface ExperimentSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exp: ClaimsExperiment) => void;
}

// ── Component ──

export function ExperimentSetupDialog({
  open,
  onOpenChange,
  onCreated,
}: ExperimentSetupDialogProps) {
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
                                  {formatDurationSec(ep.durationSeconds)}
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
