import { useState, useEffect, useCallback, useRef } from "react";
import {
  FlaskConical,
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
  Upload,
  CheckCircle2,
  AlertCircle,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { useAuth } from "@clerk/clerk-react";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  SttExperiment,
  SttExperimentStatus,
  SttBenchmarkResult,
  SttResultsGrid,
  SttEligibleEpisode,
  PaginatedResponse,
} from "@/types/admin";

// ── Constants ──

const STT_MODELS = [
  { id: "whisper-1", label: "OpenAI Whisper", price: 0.006 },
  { id: "nova-2", label: "Deepgram Nova-2", price: 0.0043 },
  { id: "assemblyai-best", label: "AssemblyAI Best", price: 0.015 },
  { id: "google-chirp", label: "Google Chirp", price: 0.024 },
] as const;

const SPEED_OPTIONS = [1, 1.5, 2] as const;

const COST_PER_MINUTE: Record<string, number> = {
  "whisper-1": 0.006,
  "nova-2": 0.0043,
  "assemblyai-best": 0.015,
  "google-chirp": 0.024,
};

const MAX_DURATION_SECONDS = 900; // 15 minutes

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

const PAGE_SIZE = 20;

// ── Audio Processing ──

async function processAudio(audioUrl: string, speed: number, token?: string | null): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(audioUrl, { headers });
  if (!response.ok) {
    throw new Error(`Audio fetch failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  // Truncate to first 15 minutes of source audio
  const maxSamples = Math.min(
    decoded.length,
    MAX_DURATION_SECONDS * decoded.sampleRate
  );

  // Create truncated buffer
  const truncated = new AudioContext().createBuffer(
    decoded.numberOfChannels,
    maxSamples,
    decoded.sampleRate
  );
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    truncated.copyToChannel(
      decoded.getChannelData(ch).slice(0, maxSamples),
      ch
    );
  }

  // Apply speed change via OfflineAudioContext
  const outputLength = Math.ceil(maxSamples / speed);
  const offlineCtx = new OfflineAudioContext(
    truncated.numberOfChannels,
    outputLength,
    truncated.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = truncated;
  source.playbackRate.value = speed;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return encodeToMp3(rendered);
}

async function encodeToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
  const { Mp3Encoder } = await import("@/lib/lamejs-bundle");
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(1, sampleRate, 128); // mono, 128kbps

  // Convert Float32 to Int16
  const samples = audioBuffer.getChannelData(0);
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const chunks: Uint8Array[] = [];
  // Encode in 1152-sample chunks
  for (let i = 0; i < int16.length; i += 1152) {
    const chunk = int16.subarray(i, i + 1152);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
  }
  const final = encoder.flush();
  if (final.length > 0) chunks.push(new Uint8Array(final));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

// ── Helpers ──

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

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCost(dollars: number): string {
  return `$${dollars.toFixed(4)}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatWer(wer: number): string {
  return `${(wer * 100).toFixed(1)}%`;
}

// ── Sub-components ──

function ExperimentStatusBadge({ status }: { status: SttExperimentStatus }) {
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
}: {
  value: number;
  max: number;
  className?: string;
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
        className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Experiments List View ──

function ExperimentsList({
  onSelect,
  onNewExperiment,
}: {
  onSelect: (exp: SttExperiment) => void;
  onNewExperiment: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [experiments, setExperiments] = useState<SttExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExperiments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<{ data: SttExperiment[] }>(
        "/stt-benchmark/experiments"
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
            <FlaskConical className="h-10 w-10 text-[#9CA3AF]/40" />
            <p className="text-[#9CA3AF] text-sm">No experiments yet</p>
            <p className="text-[#9CA3AF]/60 text-xs">
              Create your first STT benchmark experiment to compare models
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
                <TableHead className="text-[#9CA3AF] text-xs">Episodes</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Models</TableHead>
                <TableHead className="text-[#9CA3AF] text-xs w-40">
                  Progress
                </TableHead>
                <TableHead className="text-[#9CA3AF] text-xs">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments.map((exp) => (
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
                  <TableCell className="text-[#9CA3AF] text-sm tabular-nums">
                    {exp.config.episodeIds.length}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {exp.config.models.map((m) => (
                        <Badge
                          key={m}
                          className="bg-white/5 text-[#9CA3AF] text-[9px] font-mono"
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={exp.doneTasks} max={exp.totalTasks} />
                      <span className="text-[10px] text-[#9CA3AF] tabular-nums whitespace-nowrap">
                        {exp.doneTasks}/{exp.totalTasks}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#9CA3AF] text-xs">
                    {relativeTime(exp.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Experiment Setup Dialog ──

function ExperimentSetupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (exp: SttExperiment) => void;
}) {
  const apiFetch = useAdminFetch();

  // Form state
  const [name, setName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedSpeeds, setSelectedSpeeds] = useState<number[]>([1]);
  const [selectedEpisodes, setSelectedEpisodes] = useState<SttEligibleEpisode[]>(
    []
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Episode picker state
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodePage, setEpisodePage] = useState(1);
  const [episodes, setEpisodes] = useState<SttEligibleEpisode[]>([]);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        const data = await apiFetch<PaginatedResponse<SttEligibleEpisode>>(
          `/stt-benchmark/eligible-episodes?${params}`
        );
        setEpisodes(data.data);
        setTotalEpisodes(data.total);
      } catch {
        // silently handle — episodes will show empty
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

  // Cost estimate
  const totalMinutes =
    selectedEpisodes.length * selectedModels.length * selectedSpeeds.length * 15;
  const perModelCosts = selectedModels.map((m) => ({
    model: m,
    cost:
      selectedEpisodes.length *
      selectedSpeeds.length *
      15 *
      (COST_PER_MINUTE[m] ?? 0),
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
      const result = await apiFetch<{ data: SttExperiment }>(
        "/stt-benchmark/experiments",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            models: selectedModels,
            speeds: selectedSpeeds,
            episodeIds: selectedEpisodes.map((e) => e.id),
          }),
        }
      );
      onCreated(result.data);
      onOpenChange(false);
      // Reset form
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

        <ScrollArea className="flex-1 pr-4">
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
                {STT_MODELS.map((m) => (
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
                      <div className="text-[10px] text-[#9CA3AF] font-mono">
                        {m.id} &middot; ${m.price}/min
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

              {/* Selected episodes chips */}
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
                                {formatDuration(ep.durationSeconds)}
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
                          {mc.model}
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

            {/* Error */}
            {createError && (
              <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-3 py-2">
                <p className="text-xs text-[#EF4444]">{createError}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
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

// ── Results Dashboard ──

function ResultsDashboard({
  experiment: initialExperiment,
  onBack,
}: {
  experiment: SttExperiment;
  onBack: () => void;
}) {
  const apiFetch = useAdminFetch();
  const { getToken } = useAuth();

  const [experiment, setExperiment] = useState<SttExperiment>(initialExperiment);
  const [results, setResults] = useState<SttBenchmarkResult[]>([]);
  const [grid, setGrid] = useState<SttResultsGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Audio processing state
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

  // Fetch results
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

  // Drive tasks + poll results when RUNNING
  const runNextAndPoll = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { done: boolean } }>(
        `/stt-benchmark/experiments/${experiment.id}/run`,
        { method: "POST" }
      );
      if (res.data.done) {
        // Experiment completed — final results load
        await loadResults();
        return;
      }
    } catch (err) {
      console.error("runNext error:", err instanceof Error ? err.message : err);
    }
    await loadResults();
  }, [apiFetch, experiment.id, loadResults]);

  useEffect(() => {
    if (experiment.status === "RUNNING") {
      pollRef.current = setInterval(runNextAndPoll, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [experiment.status, runNextAndPoll]);

  // Process and upload audio
  const processAndUploadAudio = useCallback(async () => {
    setAudioPhase("processing");
    setAudioError(null);

    const episodes = experiment.config.episodeIds;
    const speeds = experiment.config.speeds;
    const total = episodes.length * speeds.length;
    setAudioProgress({ done: 0, total });

    try {
      const token = await getToken();
      let done = 0;

      for (const episodeId of episodes) {
        for (const speed of speeds) {
          // Find audio URL from results
          const matchingResult = results.find(
            (r) => r.episodeId === episodeId && r.speed === speed
          );
          if (!matchingResult?.r2AudioKey) {
            // Fetch audio via worker proxy (avoids CORS, pre-trimmed to 15 min)
            const proxyUrl = `/api/admin/stt-benchmark/episode-audio/${episodeId}`;

            // Process audio client-side
            const blob = await processAudio(proxyUrl, speed, token);

            // Upload via multipart form
            const formData = new FormData();
            formData.append("file", blob, `${episodeId}_${speed}x.mp3`);
            formData.append("experimentId", experiment.id);
            formData.append("episodeId", episodeId);
            formData.append("speed", String(speed));

            await fetch("/api/admin/stt-benchmark/upload-audio", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
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

  // Start experiment run
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

  // Process audio then start
  const handleProcessAndRun = useCallback(async () => {
    await processAndUploadAudio();
    if (mountedRef.current) {
      await startRun();
    }
  }, [processAndUploadAudio, startRun]);

  // Cancel
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

  // Delete
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

  // Compute winners from grid
  const winners = computeWinners(grid);

  // Group results by episode
  const resultsByEpisode = results.reduce(
    (acc, r) => {
      const key = r.episodeId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    },
    {} as Record<string, SttBenchmarkResult[]>
  );

  // Get unique speeds from grid for column headers
  const gridSpeeds = [...new Set(grid.map((g) => g.speed))].sort();
  const gridModels = [...new Set(grid.map((g) => g.model))];

  // Find best/worst for coloring
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

      {/* Error Banner */}
      {error && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3">
          <p className="text-sm text-[#EF4444]">{error}</p>
        </div>
      )}

      {/* Audio Processing Progress */}
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

      {/* Progress Section */}
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

      {/* Winner Banner */}
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
                  {winners.lowestWer.model} @ {winners.lowestWer.speed}x
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
                  {winners.lowestCost.model} @ {winners.lowestCost.speed}x
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
                  {winners.fastest.model} @ {winners.fastest.speed}x
                </div>
                <div className="text-xs text-[#9CA3AF] tabular-nums">
                  {formatLatency(winners.fastest.avgLatency)}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Summary Grid */}
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
              {gridModels.map((model) => (
                <TableRow key={model} className="border-white/5">
                  <TableCell className="text-[#F9FAFB] text-xs font-mono">
                    {model}
                  </TableCell>
                  {gridSpeeds.map((speed) => {
                    const cell = grid.find(
                      (g) => g.model === model && g.speed === speed
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

                    const isBestWer =
                      werValues.length > 0 &&
                      cell.avgWer === Math.min(...werValues);
                    const isWorstWer =
                      werValues.length > 0 &&
                      cell.avgWer === Math.max(...werValues);
                    const isBestCost =
                      costValues.length > 0 &&
                      cell.avgCost === Math.min(...costValues);
                    const isWorstCost =
                      costValues.length > 0 &&
                      cell.avgCost === Math.max(...costValues);
                    const isBestLat =
                      latValues.length > 0 &&
                      cell.avgLatency === Math.min(...latValues);
                    const isWorstLat =
                      latValues.length > 0 &&
                      cell.avgLatency === Math.max(...latValues);

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

      {/* Per-Episode Results */}
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
                              {r.model}
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
                              <span className="font-mono">{r.model}</span> @{" "}
                              {r.speed}x: {r.errorMessage}
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Transcripts */}
                    {epResults.some((r) => r.status === "COMPLETED") && (
                      <div className="mt-3 border-t border-white/5 pt-3">
                        <span className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">
                          Transcripts
                        </span>
                        <Accordion type="multiple" className="mt-1">
                          <ReferenceTranscriptViewer episodeId={episodeId} />
                          {epResults
                            .filter((r) => r.status === "COMPLETED" && r.r2TranscriptKey)
                            .map((r) => (
                              <TranscriptViewer
                                key={r.id}
                                resultId={r.id}
                                model={r.model}
                                speed={r.speed}
                              />
                            ))}
                        </Accordion>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Card>
      )}

      {/* Empty state for results */}
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

// ── Result status badge ──

// ── Transcript Viewer (lazy-loaded per result) ──

function TranscriptViewer({
  resultId,
  model,
  speed,
}: {
  resultId: string;
  model: string;
  speed: number;
}) {
  const apiFetch = useAdminFetch();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (transcript !== null) return; // already loaded
    setLoading(true);
    try {
      const data = await apiFetch<{ data: { transcript: string } }>(
        `/stt-benchmark/results/${resultId}/transcript`
      );
      setTranscript(data.data.transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, resultId, transcript]);

  return (
    <AccordionItem value={`transcript-${resultId}`} className="border-white/5">
      <AccordionTrigger
        className="text-[#9CA3AF] text-[10px] hover:no-underline py-1"
        onClick={load}
      >
        <span className="font-mono">{model}</span> @ {speed}x transcript
      </AccordionTrigger>
      <AccordionContent>
        {loading && (
          <div className="text-[#9CA3AF] text-xs flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading transcript...
          </div>
        )}
        {error && (
          <div className="text-[#EF4444] text-xs py-2">{error}</div>
        )}
        {transcript !== null && (
          <pre className="text-[#D1D5DB] text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-[#0A1628] rounded p-3 max-h-64 overflow-auto font-sans">
            {transcript}
          </pre>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ReferenceTranscriptViewer({ episodeId }: { episodeId: string }) {
  const apiFetch = useAdminFetch();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (transcript !== null) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ data: { transcript: string } }>(
        `/stt-benchmark/episodes/${episodeId}/reference-transcript`
      );
      setTranscript(data.data.transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, episodeId, transcript]);

  return (
    <AccordionItem value={`ref-${episodeId}`} className="border-white/5">
      <AccordionTrigger
        className="text-[#10B981] text-[10px] hover:no-underline py-1"
        onClick={load}
      >
        Official Reference Transcript
      </AccordionTrigger>
      <AccordionContent>
        {loading && (
          <div className="text-[#9CA3AF] text-xs flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading transcript...
          </div>
        )}
        {error && (
          <div className="text-[#EF4444] text-xs py-2">{error}</div>
        )}
        {transcript !== null && (
          <pre className="text-[#D1D5DB] text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-[#0A1628] rounded p-3 max-h-64 overflow-auto font-sans">
            {transcript}
          </pre>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ResultStatusBadge({
  status,
}: {
  status: SttBenchmarkResult["status"];
}) {
  const styles: Record<
    string,
    { bg: string; text: string; pulse?: boolean }
  > = {
    PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
    RUNNING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
    POLLING: { bg: "#8B5CF620", text: "#8B5CF6", pulse: true },
    COMPLETED: { bg: "#10B98120", text: "#10B981" },
    FAILED: { bg: "#EF444420", text: "#EF4444" },
  };
  const s = styles[status] || styles.PENDING;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

// ── Winner computation ──

function computeWinners(grid: SttResultsGrid[]) {
  const completed = grid.filter((g) => g.completedCount > 0);
  if (completed.length === 0) return null;

  const withWer = completed.filter((g) => g.avgWer > 0);
  const withCost = completed.filter((g) => g.avgCost > 0);
  const withLatency = completed.filter((g) => g.avgLatency > 0);

  return {
    lowestWer:
      withWer.length > 0
        ? withWer.reduce((a, b) => (a.avgWer < b.avgWer ? a : b))
        : null,
    lowestCost:
      withCost.length > 0
        ? withCost.reduce((a, b) => (a.avgCost < b.avgCost ? a : b))
        : null,
    fastest:
      withLatency.length > 0
        ? withLatency.reduce((a, b) =>
            a.avgLatency < b.avgLatency ? a : b
          )
        : null,
  };
}

// ── Main Page Component ──

type View =
  | { type: "list" }
  | { type: "results"; experiment: SttExperiment };

export default function SttBenchmark() {
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
