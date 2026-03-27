import { useState, useEffect, useCallback, useRef } from "react";
import {
  FlaskConical,
  Loader2,
  Search,
  Shuffle,
  XCircle,
  DollarSign,
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
import { formatDurationSec, formatCost } from "@/lib/admin-formatters";
import type {
  SttExperiment,
  SttEligibleEpisode,
  PaginatedResponse,
} from "@/types/admin";

export const SPEED_OPTIONS = [1, 1.5, 2] as const;
export const MAX_DURATION_SECONDS = 900; // 15 minutes

const PAGE_SIZE = 20;

interface SttModelOption {
  id: string;
  modelId: string;
  provider: string;
  providerLabel: string;
  label: string;
  price: number;
}

function qualifiedModel(model: string, provider?: string): string {
  if (!provider) return model;
  return `${model} (${provider})`;
}

export interface ExperimentSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exp: SttExperiment) => void;
}

export function ExperimentSetupDialog({
  open,
  onOpenChange,
  onCreated,
}: ExperimentSetupDialogProps) {
  const apiFetch = useAdminFetch();

  const [name, setName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedSpeeds, setSelectedSpeeds] = useState<number[]>([1]);
  const [selectedEpisodes, setSelectedEpisodes] = useState<SttEligibleEpisode[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [sttModels, setSttModels] = useState<SttModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodePage, setEpisodePage] = useState(1);
  const [episodes, setEpisodes] = useState<SttEligibleEpisode[]>([]);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingModels(true);
        const resp = await apiFetch<{ data: any[] }>("/ai-models?stage=stt");
        if (cancelled) return;
        const models: SttModelOption[] = [];
        for (const m of resp.data) {
          for (const p of m.providers ?? []) {
            models.push({
              id: `${m.modelId}:${p.provider}`,
              modelId: m.modelId,
              provider: p.provider,
              providerLabel: p.providerLabel,
              label: m.label,
              price: p.pricePerMinute ?? 0,
            });
          }
        }
        setSttModels(models);
      } catch {
        // keep empty
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const loadEpisodes = useCallback(
    async (search: string, page: number) => {
      try {
        setLoadingEpisodes(true);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (search) params.set("search", search);
        const data = await apiFetch<PaginatedResponse<SttEligibleEpisode>>(
          `/stt-benchmark/eligible-episodes?${params}`
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
    if (open) {
      loadEpisodes("", 1);
    }
  }, [open, loadEpisodes]);

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

  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleSpeed = (speed: number) => {
    setSelectedSpeeds((prev) =>
      prev.includes(speed) ? prev.filter((s) => s !== speed) : [...prev, speed]
    );
  };

  const toggleEpisode = (ep: SttEligibleEpisode) => {
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

  const totalMinutes =
    selectedEpisodes.length * selectedModels.length * selectedSpeeds.length * 15;
  const modelPriceMap = new Map(sttModels.map((m) => [m.id, m.price]));
  const modelLabelMap = new Map(sttModels.map((m) => [m.id, qualifiedModel(m.modelId, m.provider)]));
  const perModelCosts = selectedModels.map((m) => ({
    model: m,
    label: modelLabelMap.get(m) ?? m,
    cost:
      selectedEpisodes.length *
      selectedSpeeds.length *
      15 *
      (modelPriceMap.get(m) ?? 0),
  }));
  const totalCost = perModelCosts.reduce((sum, c) => sum + c.cost, 0);

  const canCreate =
    name.trim() &&
    selectedModels.length > 0 &&
    selectedSpeeds.length > 0 &&
    selectedEpisodes.length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      setCreateError(null);
      const modelProviders = selectedModels.map((id) => {
        const opt = sttModels.find((m) => m.id === id);
        return { modelId: opt!.modelId, provider: opt!.provider };
      });
      const result = await apiFetch<{ data: SttExperiment }>(
        "/stt-benchmark/experiments",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            models: modelProviders,
            speeds: selectedSpeeds,
            episodeIds: selectedEpisodes.map((e) => e.id),
          }),
        }
      );
      onCreated(result.data);
      onOpenChange(false);
      setName("");
      setSelectedModels([]);
      setSelectedSpeeds([1]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0F1D32] border-white/10 text-[#F9FAFB] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[#3B82F6]" />
            New STT Benchmark Experiment
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Compare STT models across audio speeds using episodes with official transcripts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="space-y-6 pb-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#9CA3AF]">
                Experiment Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Batch comparison Q1 2026"
                className="bg-white/5 border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50 focus:border-[#3B82F6]/50"
              />
            </div>

            {/* Models */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#9CA3AF]">
                Models
              </label>
              <div className="grid grid-cols-2 gap-2">
                {loadingModels && <Skeleton className="h-12 col-span-2" />}
                {sttModels.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      selectedModels.includes(m.id)
                        ? "border-[#3B82F6]/50 bg-[#3B82F6]/5"
                        : "border-white/5 hover:border-white/10 bg-white/[0.02]"
                    )}
                  >
                    <Checkbox
                      checked={selectedModels.includes(m.id)}
                      onCheckedChange={() => toggleModel(m.id)}
                    />
                    <div>
                      <div className="text-sm text-[#F9FAFB]">{m.label}</div>
                      <div className="text-[10px] text-[#9CA3AF]">
                        {m.providerLabel}
                      </div>
                      <div className="text-[10px] text-[#9CA3AF] font-mono">
                        {m.modelId} &middot; ${m.price}/min
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Speeds */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#9CA3AF]">
                Playback Speeds
              </label>
              <div className="flex gap-2">
                {SPEED_OPTIONS.map((speed) => (
                  <label
                    key={speed}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 cursor-pointer transition-colors",
                      selectedSpeeds.includes(speed)
                        ? "border-[#3B82F6]/50 bg-[#3B82F6]/5"
                        : "border-white/5 hover:border-white/10 bg-white/[0.02]"
                    )}
                  >
                    <Checkbox
                      checked={selectedSpeeds.includes(speed)}
                      onCheckedChange={() => toggleSpeed(speed)}
                    />
                    <span className="text-sm text-[#F9FAFB]">{speed}x</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Episode Picker */}
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
                      No eligible episodes found
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

            {/* Cost Estimate */}
            {selectedModels.length > 0 &&
              selectedEpisodes.length > 0 &&
              selectedSpeeds.length > 0 && (
                <Card className="bg-[#0A1628] border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[#10B981]" />
                    <span className="text-xs font-medium text-[#9CA3AF]">
                      Cost Estimate
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {perModelCosts.map((mc) => (
                      <div
                        key={mc.model}
                        className="flex items-center justify-between rounded-md bg-white/[0.02] border border-white/5 px-3 py-2"
                      >
                        <span className="text-xs text-[#9CA3AF] font-mono">
                          {mc.label}
                        </span>
                        <span className="text-xs text-[#F9FAFB] font-mono tabular-nums">
                          {formatCost(mc.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-xs text-[#9CA3AF]">
                      {totalMinutes} total minutes across{" "}
                      {selectedEpisodes.length *
                        selectedModels.length *
                        selectedSpeeds.length}{" "}
                      tasks
                    </span>
                    <span className="text-sm font-semibold text-[#10B981] tabular-nums">
                      {formatCost(totalCost)}
                    </span>
                  </div>
                </Card>
              )}

            {createError && (
              <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-3 py-2">
                <p className="text-xs text-[#EF4444]">{createError}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            disabled={!canCreate || creating}
            onClick={handleCreate}
            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-1.5" />
            )}
            Create & Run
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
