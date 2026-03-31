import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import {
  Play,
  Search,
  Clock,
  Mic,
  BarChart3,
  User,
  Download,
  Disc3,
  ExternalLink,
  Megaphone,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import { relativeTime } from "@/lib/admin-formatters";
import type {
  AdminBriefing,
  AdminBriefingDetail,
  BriefingPipelineStep,
  PaginatedResponse,
} from "@/types/admin";

// ── Helpers ──

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function tierBadgeClass(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS":
    case "PRO+":
      return "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30";
    case "PRO":
      return "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

function tierLabel(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS": return "PRO+";
    case "PRO": return "PRO";
    default: return "FREE";
  }
}

function statusBadge(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30";
    case "FAILED":
      return "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

// ── Briefing Card ──

function BriefingCard({
  briefing,
  selected,
  onClick,
}: {
  briefing: AdminBriefing;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 space-y-2 transition-all",
        selected
          ? "bg-[#3B82F6]/10 border-[#3B82F6]/30"
          : "bg-[#1A2942] border-white/5 hover:border-white/10"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#F9FAFB] truncate">{briefing.userEmail}</span>
          <Badge className={cn("text-[9px] uppercase shrink-0", tierBadgeClass(briefing.userPlan))}>
            {tierLabel(briefing.userPlan)}
          </Badge>
        </div>
        <Badge className={cn("text-[9px] uppercase shrink-0", statusBadge(briefing.clipStatus))}>
          {briefing.clipStatus}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
        <span>{relativeTime(briefing.createdAt)}</span>
        <span>{briefing.durationTier}m tier</span>
        {briefing.actualSeconds != null && (
          <span>{formatDuration(briefing.actualSeconds)}</span>
        )}
        {briefing.episodeDurationSeconds != null && (
          <span>{Math.round(briefing.episodeDurationSeconds / 60)}m ep</span>
        )}
      </div>

      {(briefing.episodeTitle || briefing.podcastTitle) && (
        <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF]">
          {briefing.podcastImageUrl ? (
            <img src={briefing.podcastImageUrl} alt="" className="h-4 w-4 rounded object-cover shrink-0" />
          ) : (
            <Disc3 className="h-3 w-3 shrink-0 opacity-40" />
          )}
          <span className="truncate">{briefing.episodeTitle ?? briefing.podcastTitle}</span>
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
        <span>{briefing.feedItemCount} feed item{briefing.feedItemCount !== 1 ? "s" : ""}</span>
      </div>
    </button>
  );
}

// ── Loading skeleton ──

function BriefingSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      <div className="w-full md:w-1/2 shrink-0 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Pipeline Step Row ──

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  NARRATIVE_GENERATION: "Narrative",
  AUDIO_GENERATION: "Audio Gen",
  CLIP_GENERATION: "Clip Gen", // legacy
  BRIEFING_ASSEMBLY: "Assembly",
};

function PipelineStepRow({ step }: { step: BriefingPipelineStep }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#0A1628] border border-white/5 p-2 text-[10px]">
      <span className="text-[#9CA3AF] w-24 shrink-0">{STAGE_NAMES[step.stage] ?? step.stage}</span>
      <Badge className={cn("text-[8px] uppercase shrink-0", statusBadge(step.status))}>
        {step.status}
      </Badge>
      {step.cached && (
        <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] text-[8px] px-1 py-0">
          <Zap className="h-2 w-2 mr-0.5 inline" />
          cached
        </Badge>
      )}
      <div className="flex items-center gap-2 ml-auto font-mono tabular-nums shrink-0">
        {step.durationMs != null && (
          <span className="text-[#9CA3AF]">{step.durationMs}ms</span>
        )}
        {step.cost != null && (
          <span className="text-[#10B981]">${step.cost.toFixed(4)}</span>
        )}
        {step.model && (
          <span className="text-[#8B5CF6]" title={step.model}>
            {step.model.split("+").map(m => m.split("-").slice(0, 3).join("-")).join("+")}
          </span>
        )}
        {(step.inputTokens != null || step.outputTokens != null) && (
          <span className="text-[#9CA3AF]" title={`In: ${step.inputTokens ?? 0} / Out: ${step.outputTokens ?? 0}`}>
            {step.inputTokens != null ? `${step.inputTokens.toLocaleString()}in` : ""}
            {step.outputTokens != null && step.outputTokens > 0 ? `/${step.outputTokens.toLocaleString()}out` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main ──

export default function BriefingsPage() {
  const apiFetch = useAdminFetch();

  const [briefings, setBriefings] = useState<AdminBriefing[]>([]);
  const [selected, setSelected] = useState<AdminBriefingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    apiFetch<PaginatedResponse<AdminBriefing>>(`/briefings?${params}`)
      .then((r) => setBriefings(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  usePolling(() => load(), 5_000);

  const selectBriefing = useCallback(
    (id: string) => {
      setDetailLoading(true);
      apiFetch<{ data: AdminBriefingDetail }>(`/briefings/${id}`)
        .then((r) => setSelected(r.data))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  if (loading && briefings.length === 0) return <BriefingSkeleton />;

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)]">
      {/* ── LEFT: Briefing List ── */}
      <div className="w-full md:w-1/2 shrink-0 flex flex-col gap-3 min-h-0">
        {/* Filters */}
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-28 bg-[#1A2942] border-white/5 text-xs text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 pl-7 text-xs bg-[#1A2942] border-white/5 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {briefings.map((b) => (
              <BriefingCard
                key={b.id}
                briefing={b}
                selected={selected?.id === b.id}
                onClick={() => selectBriefing(b.id)}
              />
            ))}
            {briefings.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <Clock className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No briefings found</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT: Detail Panel ── */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
        {selected ? (
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-2">
              {/* Header */}
              <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-[#14B8A6]" />
                    <span className="text-sm text-[#F9FAFB] font-medium">{selected.userEmail}</span>
                    <Badge className={cn("text-[9px] uppercase", tierBadgeClass(selected.userPlan))}>
                      {tierLabel(selected.userPlan)}
                    </Badge>
                  </div>
                  <span className="text-xs text-[#9CA3AF]">{relativeTime(selected.createdAt)}</span>
                </div>
              </div>

              {/* Clip Detail */}
              <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-[#8B5CF6]" />
                  <span className="text-sm font-semibold text-[#F9FAFB]">Clip</span>
                  <Badge className={cn("text-[9px] uppercase ml-auto", statusBadge(selected.clip.status))}>
                    {selected.clip.status}
                  </Badge>
                </div>

                {/* Podcast/Episode info */}
                <div className="flex items-start gap-3">
                  {selected.clip.podcastImageUrl ? (
                    <img src={selected.clip.podcastImageUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Disc3 className="h-5 w-5 text-[#9CA3AF]/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#F9FAFB] truncate">
                      {selected.clip.episodeTitle ?? "Unknown Episode"}
                    </div>
                    <div className="text-[10px] text-[#9CA3AF] truncate">
                      {selected.clip.podcastTitle ?? "Unknown Podcast"}
                    </div>
                  </div>
                </div>

                {/* Clip stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-md bg-[#0A1628] border border-white/5 p-2.5 text-center">
                    <div className="text-sm font-bold font-mono tabular-nums text-[#F9FAFB]">
                      {selected.clip.durationTier}m
                    </div>
                    <div className="text-[9px] text-[#9CA3AF]">Duration Tier</div>
                  </div>
                  <div className="rounded-md bg-[#0A1628] border border-white/5 p-2.5 text-center">
                    <div className="text-sm font-bold font-mono tabular-nums text-[#F9FAFB]">
                      {selected.clip.actualSeconds != null
                        ? formatDuration(selected.clip.actualSeconds)
                        : "-"}
                    </div>
                    <div className="text-[9px] text-[#9CA3AF]">Actual</div>
                  </div>
                  <div className="rounded-md bg-[#0A1628] border border-white/5 p-2.5 text-center">
                    <div className="text-sm font-bold font-mono tabular-nums text-[#F9FAFB]">
                      {selected.clip.episodeDurationSeconds != null
                        ? `${Math.round(selected.clip.episodeDurationSeconds / 60)}m`
                        : "-"}
                    </div>
                    <div className="text-[9px] text-[#9CA3AF]">Episode</div>
                  </div>
                  <div className="rounded-md bg-[#0A1628] border border-white/5 p-2.5 text-center">
                    <div className="text-sm font-bold font-mono tabular-nums text-[#F9FAFB]">
                      {selected.clip.wordCount ?? "-"}
                    </div>
                    <div className="text-[9px] text-[#9CA3AF]">Words</div>
                  </div>
                </div>

                {/* Audio link */}
                {selected.clip.audioUrl && (
                  <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
                    <Play className="h-3 w-3 text-[#3B82F6]" />
                    <span className="text-[10px] text-[#3B82F6] truncate flex-1 font-mono">
                      {selected.clip.audioUrl}
                    </span>
                    <Button variant="ghost" size="icon-xs" className="text-[#9CA3AF] hover:text-[#F9FAFB]" asChild>
                      <a href={selected.clip.audioUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="text-[#9CA3AF] hover:text-[#F9FAFB]" asChild>
                      <a href={selected.clip.audioUrl} download>
                        <Download className="h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              {/* AI Usage / Pipeline Steps */}
              {selected.pipelineSteps && selected.pipelineSteps.length > 0 && (
                <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-[#14B8A6]" />
                    <span className="text-sm font-semibold text-[#F9FAFB]">AI Usage</span>
                    {(() => {
                      const totalCost = selected.pipelineSteps!.reduce((s, st) => s + (st.cost ?? 0), 0);
                      return totalCost > 0 ? (
                        <span className="text-xs text-[#10B981] font-mono tabular-nums ml-auto">
                          ${totalCost.toFixed(4)} total
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    {selected.pipelineSteps.map((step) => (
                      <PipelineStepRow key={step.stage} step={step} />
                    ))}
                  </div>
                </div>
              )}

              {/* Ad Audio (future) */}
              {selected.adAudioUrl && (
                <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-[#F59E0B]" />
                    <span className="text-sm font-semibold text-[#F9FAFB]">Ad Audio</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
                    <Play className="h-3 w-3 text-[#F59E0B]" />
                    <span className="text-[10px] text-[#F59E0B] truncate flex-1 font-mono">
                      {selected.adAudioUrl}
                    </span>
                  </div>
                </div>
              )}

              {/* Feed Items delivered from this briefing */}
              <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#F59E0B]" />
                  <span className="text-sm font-semibold text-[#F9FAFB]">Feed Items</span>
                  <Badge className="bg-white/5 text-[#9CA3AF] text-[9px] ml-auto">
                    {selected.feedItems.length}
                  </Badge>
                </div>

                {selected.feedItems.length > 0 ? (
                  <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">Status</th>
                          <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">Source</th>
                          <th className="text-center px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">Listened</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.feedItems.map((fi) => (
                          <tr key={fi.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                            <td className="px-3 py-2">
                              <Badge className={cn("text-[9px] uppercase", statusBadge(fi.status))}>
                                {fi.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-[#9CA3AF]">{fi.source}</td>
                            <td className="px-3 py-2 text-center">
                              {fi.listened ? (
                                <span className="text-[#10B981]">Yes</span>
                              ) : (
                                <span className="text-[#9CA3AF]">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-[#9CA3AF]">{relativeTime(fi.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-[#9CA3AF] text-xs">No feed items</div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <Mic className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Select a briefing to view details</span>
          </div>
        )}
      </div>
    </div>
  );
}
