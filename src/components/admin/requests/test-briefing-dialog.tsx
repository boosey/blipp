import { useState, useEffect } from "react";
import {
  Loader2,
  XCircle,
  FlaskConical,
  Search,
  Inbox,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/api-client";
import { DURATION_TIERS } from "@/lib/duration-tiers";
import type {
  AdminPodcast,
  AdminEpisode,
  BriefingRequestItem,
} from "@/types/admin";

function EpisodePicker({
  podcastId,
  selectedEpisodeId,
  onSelect,
}: {
  podcastId: string;
  selectedEpisodeId: string | null;
  onSelect: (episodeId: string | null) => void;
}) {
  const apiFetch = useAdminFetch();
  const [episodes, setEpisodes] = useState<AdminEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: AdminEpisode[] }>(`/episodes?podcastId=${podcastId}&pageSize=50`)
      .then((r) => setEpisodes(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, podcastId]);

  const filtered = filter
    ? episodes.filter((e) => e.title.toLowerCase().includes(filter.toLowerCase()))
    : episodes;

  if (loading) {
    return (
      <div className="space-y-1 py-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF]" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter episodes..."
          className="h-7 pl-7 text-[10px] bg-[#0A1628] border-white/5 text-[#F9FAFB]"
        />
      </div>
      <ScrollArea className="max-h-32">
        <div className="space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-[10px] text-[#9CA3AF] py-2 text-center">No episodes found</div>
          ) : (
            filtered.map((ep) => (
              <button
                key={ep.id}
                onClick={() => onSelect(selectedEpisodeId === ep.id ? null : ep.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  selectedEpisodeId === ep.id
                    ? "bg-[#3B82F6]/15 border border-[#3B82F6]/30"
                    : "hover:bg-white/[0.03] border border-transparent"
                )}
              >
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border shrink-0",
                    selectedEpisodeId === ep.id
                      ? "bg-[#3B82F6] border-[#3B82F6]"
                      : "border-[#9CA3AF]/40"
                  )}
                />
                <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums shrink-0">
                  {new Date(ep.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-[10px] text-[#F9FAFB] truncate">{ep.title}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface PodcastSelection {
  podcastId: string;
  useLatest: boolean;
  episodeId: string | null;
  durationTier: number;
}

export interface TestBriefingDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function TestBriefingDialog({
  open,
  onOpenChange,
  onSuccess,
}: TestBriefingDialogProps) {
  const apiFetch = useAdminFetch();
  const [podcasts, setPodcasts] = useState<AdminPodcast[]>([]);
  const [loadingPodcasts, setLoadingPodcasts] = useState(false);
  const [selections, setSelections] = useState<PodcastSelection[]>([]);
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [podcastSearch, setPodcastSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingPodcasts(true);
    apiFetch<{ data: AdminPodcast[] }>("/podcasts")
      .then((r) => setPodcasts(r.data))
      .catch(console.error)
      .finally(() => setLoadingPodcasts(false));
  }, [open, apiFetch]);

  const selectedIds = new Set(selections.map((s) => s.podcastId));

  const togglePodcast = (id: string) => {
    if (selectedIds.has(id)) {
      setSelections((prev) => prev.filter((s) => s.podcastId !== id));
    } else {
      setSelections((prev) => [...prev, { podcastId: id, useLatest: true, episodeId: null, durationTier: 5 }]);
    }
  };

  const toggleLatest = (podcastId: string) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId
          ? { ...s, useLatest: !s.useLatest, episodeId: null }
          : s
      )
    );
  };

  const setEpisode = (podcastId: string, episodeId: string | null) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId ? { ...s, episodeId } : s
      )
    );
  };

  const setDurationTier = (podcastId: string, tier: number) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.podcastId === podcastId ? { ...s, durationTier: tier } : s
      )
    );
  };

  const handleSubmit = async () => {
    if (selections.length === 0) return;
    const invalid = selections.some((s) => !s.useLatest && !s.episodeId);
    if (invalid) return;

    setSubmitting(true);
    try {
      const items: BriefingRequestItem[] = selections.map((s) => ({
        podcastId: s.podcastId,
        episodeId: s.useLatest ? null : s.episodeId,
        durationTier: s.durationTier,
        useLatest: s.useLatest,
      }));

      await apiFetch("/requests/test-briefing", {
        method: "POST",
        body: JSON.stringify({
          items,
          targetMinutes,
        }),
      });
      onOpenChange(false);
      setSelections([]);
      setTargetMinutes(5);
      setPodcastSearch("");
      onSuccess();
    } catch (e) {
      console.error("Failed to create test briefing:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPodcasts = podcastSearch
    ? podcasts.filter((p) => p.title.toLowerCase().includes(podcastSearch.toLowerCase()))
    : podcasts;

  const invalidCount = selections.filter((s) => !s.useLatest && !s.episodeId).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#F97316]" />
            Create Test Briefing
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duration input */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-[#F9FAFB] font-medium">Target Duration (minutes)</label>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">Total briefing length, 1-30 minutes</p>
            </div>
            <Input
              type="number"
              min={1}
              max={30}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Math.min(30, Math.max(1, Number(e.target.value))))}
              className="w-20 h-8 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
            />
          </div>

          <Separator className="bg-white/5" />

          {/* Podcast picker + episode selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#F9FAFB] font-medium">Podcasts & Episodes</label>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
                {selections.length} selected
              </Badge>
            </div>

            {/* Podcast search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
              <Input
                value={podcastSearch}
                onChange={(e) => setPodcastSearch(e.target.value)}
                placeholder="Search podcasts..."
                className="h-8 pl-8 text-xs bg-[#0F1D32] border-white/5 text-[#F9FAFB]"
              />
            </div>

            <ScrollArea className="h-72 rounded-md border border-white/5 bg-[#0F1D32]">
              <div className="p-2 space-y-0.5">
                {loadingPodcasts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-white/5 rounded" />
                  ))
                ) : filteredPodcasts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                    <Inbox className="h-5 w-5 mb-1.5 opacity-40" />
                    <span className="text-[10px]">No podcasts found</span>
                  </div>
                ) : (
                  filteredPodcasts.map((p) => {
                    const sel = selections.find((s) => s.podcastId === p.id);
                    const isSelected = !!sel;

                    return (
                      <div key={p.id} className="space-y-0">
                        {/* Podcast row */}
                        <button
                          onClick={() => togglePodcast(p.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors text-left",
                            isSelected
                              ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20"
                              : "hover:bg-white/[0.03] border border-transparent"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="data-[state=checked]:bg-[#3B82F6] data-[state=checked]:border-[#3B82F6]"
                            tabIndex={-1}
                          />
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="h-7 w-7 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded bg-white/5 shrink-0" />
                          )}
                          <span className="text-xs text-[#F9FAFB] truncate flex-1">{p.title}</span>
                          {isSelected && (
                            <span className="text-[9px] text-[#9CA3AF] shrink-0">
                              {sel.useLatest ? "Latest" : sel.episodeId ? "Picked" : "Pick..."}
                            </span>
                          )}
                        </button>

                        {/* Episode selection panel (shown when podcast is selected) */}
                        {isSelected && sel && (
                          <div className="ml-10 mr-2 mb-1 rounded-md bg-[#0A1628] border border-white/5 p-2 space-y-2">
                            {/* Duration tier selector */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#9CA3AF] w-20">Duration tier:</span>
                              <div className="flex items-center gap-1">
                                {DURATION_TIERS.map((t) => (
                                  <button
                                    key={t}
                                    onClick={(e) => { e.stopPropagation(); setDurationTier(p.id, t); }}
                                    className={cn(
                                      "rounded px-2 py-0.5 text-[10px] font-mono tabular-nums transition-colors",
                                      sel.durationTier === t
                                        ? "bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30"
                                        : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-transparent"
                                    )}
                                  >
                                    {t}m
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Latest toggle */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLatest(p.id); }}
                              className="flex items-center gap-2 w-full text-left"
                            >
                              {sel.useLatest ? (
                                <ToggleRight className="h-4 w-4 text-[#3B82F6]" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-[#9CA3AF]" />
                              )}
                              <span className="text-[10px] text-[#F9FAFB]">Use latest episode</span>
                            </button>

                            {/* Episode picker (when not using latest) */}
                            {!sel.useLatest && (
                              <EpisodePicker
                                podcastId={p.id}
                                selectedEpisodeId={sel.episodeId}
                                onSelect={(eid) => setEpisode(p.id, eid)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Validation warning */}
          {invalidCount > 0 && (
            <div className="text-[10px] text-[#F97316] flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              {invalidCount} podcast{invalidCount > 1 ? "s" : ""} need{invalidCount === 1 ? "s" : ""} an episode selected
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || selections.length === 0 || invalidCount > 0}
            className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {submitting ? "Creating..." : "Create Test Briefing"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
