import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Check,
  X,
  AlertCircle,
  Clock,
  Radio,
  Podcast,
  FileText,
  ChevronDown,
  Pause,
  Play,
  Ban,
  Archive,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FeedRefreshCard } from "@/components/admin/feed-refresh-card";
import type {
  EpisodeRefreshJob,
  EpisodeRefreshJobList,
  EpisodeRefreshProgress,
  EpisodeRefreshError,
} from "@/types/admin";

// ── Helpers ──

const SCOPE_COLORS: Record<string, string> = {
  subscribed: "#10B981",
  all: "#3B82F6",
};

const SCOPE_LABELS: Record<string, string> = {
  subscribed: "Subscribed",
  all: "All",
};

function scopeBadgeStyle(scope: string) {
  const color = SCOPE_COLORS[scope] ?? "#6B7280";
  return { backgroundColor: `${color}20`, color };
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isActive(status: string): boolean {
  return ["pending", "scanning", "prefetching"].includes(status);
}

function isTerminal(status: string): boolean {
  return ["complete", "failed", "cancelled"].includes(status);
}

type PhaseStatus = "pending" | "active" | "complete" | "failed" | "paused" | "cancelled";

function getPhaseStatuses(status: string): [PhaseStatus, PhaseStatus] {
  if (status === "pending" || status === "scanning") return ["active", "pending"];
  if (status === "prefetching") return ["complete", "active"];
  if (status === "complete") return ["complete", "complete"];
  if (status === "failed") return ["failed", "failed"];
  if (status === "paused") return ["paused", "paused"];
  if (status === "cancelled") return ["cancelled", "cancelled"];
  return ["pending", "pending"];
}

function StatusIcon({ status }: { status: string }) {
  if (isActive(status)) return <Loader2 className="h-4 w-4 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-4 w-4 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "failed") return <div className="h-4 w-4 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "paused") return <div className="h-4 w-4 rounded-full bg-[#F59E0B] flex items-center justify-center"><Pause className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "cancelled") return <div className="h-4 w-4 rounded-full bg-[#6B7280] flex items-center justify-center"><Ban className="h-2.5 w-2.5 text-white" /></div>;
  return <div className="h-4 w-4 rounded-full border-2 border-[#9CA3AF]/30" />;
}

function PhaseIndicator({ status }: { status: PhaseStatus }) {
  if (status === "active") return <Loader2 className="h-5 w-5 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-5 w-5 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>;
  if (status === "failed") return <div className="h-5 w-5 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  if (status === "paused") return <div className="h-5 w-5 rounded-full bg-[#F59E0B] flex items-center justify-center"><Pause className="h-3 w-3 text-white" /></div>;
  if (status === "cancelled") return <div className="h-5 w-5 rounded-full bg-[#6B7280] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  return <div className="h-5 w-5 rounded-full border-2 border-[#9CA3AF]/30" />;
}

function overallProgress(job: EpisodeRefreshJob): number {
  const feedScanWeight = 0.6;
  const prefetchWeight = 0.4;
  const feedPct = job.podcastsTotal > 0 ? (job.podcastsCompleted / job.podcastsTotal) * 100 : 0;
  const prefetchPct = job.prefetchTotal > 0 ? (job.prefetchCompleted / job.prefetchTotal) * 100 : 0;
  return feedPct * feedScanWeight + prefetchPct * prefetchWeight;
}

// ── Elapsed Timer ──

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="text-xs text-[#9CA3AF]">{formatDuration(elapsed)}</span>;
}

// ── Job Detail (expanded card body) ──

function JobDetail({ jobId }: { jobId: string }) {
  const apiFetch = useAdminFetch();
  const [detail, setDetail] = useState<EpisodeRefreshProgress | null>(null);
  const [errors, setErrors] = useState<EpisodeRefreshError[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorPhase, setErrorPhase] = useState("all");
  const [errorPage, setErrorPage] = useState(1);
  const [loadingErrors, setLoadingErrors] = useState(false);

  // Accumulated lists
  const [allPodcasts, setAllPodcasts] = useState<EpisodeRefreshProgress["podcastsWithNewEpisodesDetail"]>([]);
  const [allEpisodes, setAllEpisodes] = useState<EpisodeRefreshProgress["recentEpisodes"]>([]);
  const [allPrefetch, setAllPrefetch] = useState<EpisodeRefreshProgress["recentPrefetch"]>([]);
  const [pages, setPages] = useState({ podcast: 1, episode: 1, prefetch: 1 });
  const [loadingMore, setLoadingMore] = useState({ podcast: false, episode: false, prefetch: false });
  const initialLoad = useRef(true);

  const fetchDetail = useCallback(async () => {
    try {
      const result = await apiFetch<EpisodeRefreshProgress>(`/episode-refresh/${jobId}`);
      setDetail(result);
      if (initialLoad.current) {
        setAllPodcasts(result.podcastsWithNewEpisodesDetail ?? []);
        setAllEpisodes(result.recentEpisodes ?? []);
        setAllPrefetch(result.recentPrefetch ?? []);
        initialLoad.current = false;
      } else if (pages.podcast === 1) {
        setAllPodcasts(result.podcastsWithNewEpisodesDetail ?? []);
      }
    } catch {
      // Silently fail on detail polling
    }
  }, [apiFetch, jobId, pages.podcast]);

  useEffect(() => { fetchDetail(); }, []);

  const jobActive = detail?.job && isActive(detail.job.status);
  usePolling(fetchDetail, 3000, !!jobActive);

  const fetchErrors = useCallback(async (phase: string, page: number) => {
    setLoadingErrors(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (phase !== "all") params.set("phase", phase);
      const result = await apiFetch<{ data: EpisodeRefreshError[]; total: number }>(
        `/episode-refresh/${jobId}/errors?${params.toString()}`
      );
      if (page === 1) {
        setErrors(result.data);
      } else {
        setErrors((prev) => [...prev, ...result.data]);
      }
      setErrorsTotal(result.total);
    } catch {
      // Silently fail
    } finally {
      setLoadingErrors(false);
    }
  }, [apiFetch, jobId]);

  const loadMore = useCallback(async (type: "podcast" | "episode" | "prefetch") => {
    const nextPage = pages[type] + 1;
    setLoadingMore((prev) => ({ ...prev, [type]: true }));
    try {
      const params = new URLSearchParams();
      const key = type === "podcast" ? "podcastPage" : type === "episode" ? "episodePage" : "prefetchPage";
      params.set(key, String(nextPage));
      const result = await apiFetch<EpisodeRefreshProgress>(`/episode-refresh/${jobId}?${params.toString()}`);
      if (type === "podcast") setAllPodcasts((prev) => [...prev, ...(result.podcastsWithNewEpisodesDetail ?? [])]);
      else if (type === "episode") setAllEpisodes((prev) => [...prev, ...(result.recentEpisodes ?? [])]);
      else setAllPrefetch((prev) => [...prev, ...(result.recentPrefetch ?? [])]);
      setPages((prev) => ({ ...prev, [type]: nextPage }));
    } catch {
      // Revert silently
    } finally {
      setLoadingMore((prev) => ({ ...prev, [type]: false }));
    }
  }, [apiFetch, jobId, pages]);

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  const job = detail.job;
  if (!job) return null;

  const [p1Status, p2Status] = getPhaseStatuses(job.status);
  const errorCounts = detail.errorCounts ?? { feed_scan: 0, prefetch: 0, total: 0 };

  return (
    <div className="border-t border-white/5 px-4 pb-4 pt-3">
      {/* Phase stepper — 2 phases */}
      <div className="flex items-center justify-between max-w-xs mx-auto mb-4">
        <div className="flex flex-col items-center gap-1">
          <PhaseIndicator status={p1Status} />
          <span className="text-[10px] text-[#9CA3AF]">Feed Scan</span>
        </div>
        <div className="flex-1 h-px bg-white/10 mx-2 mt-[-10px]" />
        <div className="flex flex-col items-center gap-1">
          <PhaseIndicator status={p2Status} />
          <span className="text-[10px] text-[#9CA3AF]">Prefetch</span>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={p1Status === "active" ? ["podcasts"] : p2Status === "active" ? ["prefetch"] : ["podcasts"]} className="space-y-2">
        {/* Podcasts */}
        <AccordionItem value="podcasts" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex items-center gap-2 flex-1 text-left">
              <Podcast className="h-3.5 w-3.5 text-[#3B82F6]" />
              <span className="text-sm font-medium">Podcasts</span>
              <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10 text-[10px]">
                {job.podcastsCompleted}/{job.podcastsTotal}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#9CA3AF]">
                <span>Scanned</span>
                <span>{job.podcastsCompleted.toLocaleString()} / {job.podcastsTotal.toLocaleString()}</span>
              </div>
              <Progress value={job.podcastsTotal > 0 ? (job.podcastsCompleted / job.podcastsTotal) * 100 : 0} />
            </div>
            <p className="text-[10px] text-[#9CA3AF]">
              Podcasts with new episodes: {job.podcastsWithNewEpisodes.toLocaleString()}
            </p>
            {allPodcasts.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-[#9CA3AF] font-medium">
                  With updates ({allPodcasts.length} of {detail.pagination?.podcastTotal ?? allPodcasts.length})
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                  {allPodcasts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-white/5 flex items-center justify-center shrink-0">
                          <Podcast className="h-3.5 w-3.5 text-[#9CA3AF]/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">{p.title}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-[#10B981] border-[#10B981]/30 shrink-0">
                        +{p.newEpisodeCount}
                      </Badge>
                    </div>
                  ))}
                </div>
                {detail.pagination && allPodcasts.length < detail.pagination.podcastTotal && (
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={() => loadMore("podcast")} disabled={loadingMore.podcast}>
                    {loadingMore.podcast ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Load more ({detail.pagination.podcastTotal - allPodcasts.length})
                  </Button>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Episodes */}
        <AccordionItem value="episodes" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex items-center gap-2 flex-1 text-left">
              <Radio className="h-3.5 w-3.5 text-[#F59E0B]" />
              <span className="text-sm font-medium">Episodes</span>
              <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10 text-[10px]">
                {job.episodesDiscovered}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            <p className="text-[10px] text-[#9CA3AF]">
              New episodes discovered: {job.episodesDiscovered.toLocaleString()}
            </p>
            {allEpisodes.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-[#9CA3AF] font-medium">
                  Episodes ({allEpisodes.length} of {detail.pagination?.episodeTotal ?? allEpisodes.length})
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                  {allEpisodes.map((ep) => (
                    <div key={ep.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                      {ep.podcast.imageUrl ? (
                        <img src={ep.podcast.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-white/5 flex items-center justify-center shrink-0">
                          <Radio className="h-3.5 w-3.5 text-[#9CA3AF]/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">
                          <span className="text-[#9CA3AF]">{ep.podcast.title}</span> &rsaquo; {ep.title}
                        </p>
                        <p className="text-[10px] text-[#9CA3AF]">
                          {ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString() : "No date"}
                          {ep.durationSeconds != null && ` · ${Math.floor(ep.durationSeconds / 60)}:${String(ep.durationSeconds % 60).padStart(2, "0")}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.pagination && allEpisodes.length < detail.pagination.episodeTotal && (
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={() => loadMore("episode")} disabled={loadingMore.episode}>
                    {loadingMore.episode ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Load more ({detail.pagination.episodeTotal - allEpisodes.length})
                  </Button>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Content Prefetch */}
        <AccordionItem value="prefetch" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex items-center gap-2 flex-1 text-left">
              <FileText className="h-3.5 w-3.5 text-[#8B5CF6]" />
              <span className="text-sm font-medium">Content Prefetch</span>
              <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10 text-[10px]">
                {job.prefetchCompleted}/{job.prefetchTotal}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#9CA3AF]">
                <span>Prefetched</span>
                <span>{job.prefetchCompleted.toLocaleString()} / {job.prefetchTotal.toLocaleString()}</span>
              </div>
              <Progress value={job.prefetchTotal > 0 ? (job.prefetchCompleted / job.prefetchTotal) * 100 : 0} />
            </div>
            {detail.prefetchBreakdown && Object.keys(detail.prefetchBreakdown).length > 0 && (
              <div className="flex gap-3 text-[10px] text-[#9CA3AF]">
                {Object.entries(detail.prefetchBreakdown).map(([status, count]) => (
                  <span key={status}>
                    {status === "HAS_TRANSCRIPT" ? "Transcripts" : status === "HAS_AUDIO" ? "Audio" : status}: {count}
                  </span>
                ))}
              </div>
            )}
            {allPrefetch.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-[#9CA3AF] font-medium">
                  Results ({allPrefetch.length} of {detail.pagination?.prefetchTotal ?? allPrefetch.length})
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                  {allPrefetch.map((ep) => (
                    <div key={ep.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                      {ep.podcast.imageUrl ? (
                        <img src={ep.podcast.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-white/5 flex items-center justify-center shrink-0">
                          <FileText className="h-3.5 w-3.5 text-[#9CA3AF]/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">
                          <span className="text-[#9CA3AF]">{ep.podcast.title}</span> &rsaquo; {ep.title}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          ep.contentStatus === "HAS_TRANSCRIPT"
                            ? "text-[#10B981] border-[#10B981]/30"
                            : ep.contentStatus === "HAS_AUDIO"
                              ? "text-[#3B82F6] border-[#3B82F6]/30"
                              : "text-[#9CA3AF] border-white/10"
                        }`}
                      >
                        {ep.contentStatus === "HAS_TRANSCRIPT" ? "Transcript" : ep.contentStatus === "HAS_AUDIO" ? "Audio" : ep.contentStatus}
                      </Badge>
                    </div>
                  ))}
                </div>
                {detail.pagination && allPrefetch.length < detail.pagination.prefetchTotal && (
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={() => loadMore("prefetch")} disabled={loadingMore.prefetch}>
                    {loadingMore.prefetch ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Load more ({detail.pagination.prefetchTotal - allPrefetch.length})
                  </Button>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Errors */}
        <AccordionItem value="errors" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger
            className="px-3 py-2 hover:no-underline"
            onClick={() => { if (errors.length === 0 && errorCounts.total > 0) fetchErrors("all", 1); }}
          >
            <div className="flex items-center gap-2 flex-1 text-left">
              <AlertCircle className={`h-3.5 w-3.5 ${errorCounts.total > 0 ? "text-[#EF4444]" : "text-[#9CA3AF]"}`} />
              <span className="text-sm font-medium">Errors</span>
              <Badge
                variant="outline"
                className={`ml-auto mr-2 text-[10px] ${errorCounts.total > 0 ? "text-[#EF4444] border-[#EF4444]/30" : "text-[#9CA3AF] border-white/10"}`}
              >
                {errorCounts.total}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            {errorCounts.total === 0 ? (
              <p className="text-xs text-[#9CA3AF] text-center py-2">No errors recorded</p>
            ) : (
              <>
                <Tabs value={errorPhase} onValueChange={(v) => { setErrorPhase(v); setErrorPage(1); fetchErrors(v, 1); }}>
                  <TabsList className="h-7">
                    <TabsTrigger value="all" className="text-[10px] h-5 px-2">All ({errorCounts.total})</TabsTrigger>
                    <TabsTrigger value="feed_scan" className="text-[10px] h-5 px-2">Feed Scan ({errorCounts.feed_scan})</TabsTrigger>
                    <TabsTrigger value="prefetch" className="text-[10px] h-5 px-2">Prefetch ({errorCounts.prefetch})</TabsTrigger>
                  </TabsList>
                </Tabs>
                {loadingErrors && errors.length === 0 ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" /></div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                    {errors.map((err) => (
                      <div key={err.id} className="rounded p-2 bg-white/[0.02] space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] text-[#EF4444] border-[#EF4444]/30">
                            {err.phase}
                          </Badge>
                          {(err.podcastTitle || err.episodeTitle) && (
                            <span className="text-[10px] text-[#9CA3AF] truncate">
                              {err.podcastTitle}{err.episodeTitle && ` > ${err.episodeTitle}`}
                            </span>
                          )}
                          <span className="text-[10px] text-[#9CA3AF] ml-auto shrink-0">
                            {new Date(err.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-[#EF4444]/80">{err.message}</p>
                      </div>
                    ))}
                  </div>
                )}
                {errors.length < errorsTotal && (
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={() => { const next = errorPage + 1; setErrorPage(next); fetchErrors(errorPhase, next); }} disabled={loadingErrors}>
                    {loadingErrors ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Load more ({errorsTotal - errors.length})
                  </Button>
                )}
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ── Job Card ──

function JobCard({
  job,
  expanded,
  onToggle,
  onAction,
}: {
  job: EpisodeRefreshJob;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: string, jobId: string) => void;
}) {
  const elapsed = job.startedAt
    ? (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime()
    : 0;

  const active = isActive(job.status);
  const pct = overallProgress(job);

  return (
    <div className="rounded-lg border border-white/5 bg-[#1A2942] overflow-hidden">
      {/* Header row */}
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        {/* Scope badge */}
        <Badge className="text-[10px] shrink-0" style={scopeBadgeStyle(job.scope)}>
          {SCOPE_LABELS[job.scope] ?? job.scope}
        </Badge>

        {/* Trigger badge */}
        <Badge variant="outline" className="text-[10px] text-[#9CA3AF] border-white/10 shrink-0">
          {job.trigger}
        </Badge>

        {/* Time */}
        <span className="text-xs text-[#9CA3AF] shrink-0">
          {formatTime(job.startedAt)}
          {job.completedAt && ` - ${new Date(job.completedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
        </span>

        {/* Elapsed / timer */}
        <span className="text-xs text-[#9CA3AF] shrink-0">
          {active ? (
            <ElapsedTimer startedAt={job.startedAt} />
          ) : job.completedAt ? (
            formatDuration(elapsed)
          ) : null}
        </span>

        <div className="flex-1" />

        {/* Status indicator */}
        <StatusIcon status={job.status} />

        {/* Action buttons */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {active && (
            <>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#F59E0B] hover:bg-[#F59E0B]/10" onClick={() => onAction("pause", job.id)}>
                <Pause className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
                <Ban className="h-3 w-3" />
              </Button>
            </>
          )}
          {job.status === "paused" && (
            <>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#10B981] hover:bg-[#10B981]/10" onClick={() => onAction("resume", job.id)}>
                <Play className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
                <Ban className="h-3 w-3" />
              </Button>
            </>
          )}
          {isTerminal(job.status) && !job.archivedAt && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#9CA3AF] hover:bg-white/5" onClick={() => onAction("archive", job.id)}>
              <Archive className="h-3 w-3" />
            </Button>
          )}
          {isTerminal(job.status) && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("delete", job.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Stats row */}
      <div className="px-4 pb-2 text-[10px] text-[#9CA3AF]">
        {job.podcastsCompleted}/{job.podcastsTotal} pods · {job.podcastsWithNewEpisodes} with updates · {job.episodesDiscovered} new eps · {job.prefetchCompleted}/{job.prefetchTotal} prefetch
      </div>

      {/* Progress bar for active jobs */}
      {active && (
        <div className="px-4 pb-3">
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      {/* Error banner */}
      {job.error && (
        <div className="mx-4 mb-3 rounded border border-[#EF4444]/20 bg-[#EF4444]/5 p-2 text-xs text-[#EF4444]">
          {job.error}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && <JobDetail jobId={job.id} />}
    </div>
  );
}

// ── Main Page ──

export default function EpisodeRefreshPage() {
  const apiFetch = useAdminFetch();
  const [jobs, setJobs] = useState<EpisodeRefreshJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [cancelDialogJobId, setCancelDialogJobId] = useState<string | null>(null);
  const [deleteDialogJobId, setDeleteDialogJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const result = await apiFetch<EpisodeRefreshJobList>(`/episode-refresh?page=${page}&pageSize=20&archived=false`);
      setJobs(result.data);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page]);

  useEffect(() => { fetchJobs(); }, [page]);

  const hasActiveJobs = jobs.some((j) => isActive(j.status) || j.status === "paused");
  usePolling(fetchJobs, 5000, hasActiveJobs);

  const hasCompleted = jobs.some((j) => j.status === "complete");
  const hasFailed = jobs.some((j) => j.status === "failed");

  // Actions
  const triggerRefresh = async (scope: "subscribed" | "all") => {
    setActionLoading(scope);
    try {
      await apiFetch("/episode-refresh", {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to trigger ${scope} refresh`);
    } finally {
      setActionLoading(null);
    }
  };

  const bulkArchive = async (status: "complete" | "failed") => {
    setActionLoading(`archive-${status}`);
    try {
      await apiFetch("/episode-refresh/archive-bulk", {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setActionLoading(null);
    }
  };

  const handleJobAction = async (action: string, jobId: string) => {
    if (action === "cancel") {
      setCancelDialogJobId(jobId);
      return;
    }
    if (action === "delete") {
      setDeleteDialogJobId(jobId);
      return;
    }
    setActionLoading(`${action}-${jobId}`);
    try {
      if (action === "archive") {
        await apiFetch(`/episode-refresh/${jobId}/archive`, { method: "POST" });
      } else {
        await apiFetch(`/episode-refresh/${jobId}/${action}`, { method: "POST" });
      }
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelDialogJobId) return;
    setActionLoading(`cancel-${cancelDialogJobId}`);
    try {
      await apiFetch(`/episode-refresh/${cancelDialogJobId}/cancel`, { method: "POST" });
      setCancelDialogJobId(null);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialogJobId) return;
    setActionLoading(`delete-${deleteDialogJobId}`);
    try {
      await apiFetch(`/episode-refresh/${deleteDialogJobId}`, { method: "DELETE" });
      setDeleteDialogJobId(null);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Episode Refresh</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => triggerRefresh("subscribed")}
            disabled={actionLoading === "subscribed"}
            className="bg-[#10B981] hover:bg-[#059669] text-white"
          >
            {actionLoading === "subscribed" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh Subscribed
          </Button>
          <Button
            size="sm"
            onClick={() => triggerRefresh("all")}
            disabled={actionLoading === "all"}
            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
          >
            {actionLoading === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh All
          </Button>
        </div>
      </div>

      {/* Feed Refresh Card (compact) */}
      <FeedRefreshCard compact onRefresh={fetchJobs} />

      {/* Bulk archive row */}
      {(hasCompleted || hasFailed) && (
        <div className="flex items-center gap-2">
          {hasCompleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkArchive("complete")}
              disabled={actionLoading === "archive-complete"}
              className="text-[#9CA3AF] border-white/10 hover:bg-white/5 text-xs"
            >
              {actionLoading === "archive-complete" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Archive className="h-3 w-3 mr-1" />}
              Archive Completed
            </Button>
          )}
          {hasFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkArchive("failed")}
              disabled={actionLoading === "archive-failed"}
              className="text-[#9CA3AF] border-white/10 hover:bg-white/5 text-xs"
            >
              {actionLoading === "archive-failed" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Archive className="h-3 w-3 mr-1" />}
              Archive Failed
            </Button>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-sm text-[#EF4444]">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-[#EF4444] hover:text-[#EF4444]/70">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-12 text-center">
          <Clock className="h-10 w-10 text-[#9CA3AF]/30 mx-auto mb-3" />
          <p className="text-[#9CA3AF] text-sm">No episode refresh jobs found.</p>
          <p className="text-[#9CA3AF]/60 text-xs mt-1">Use the buttons above to start an episode refresh.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
              onAction={handleJobAction}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-xs text-[#9CA3AF]">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Cancel Job Dialog */}
      <AlertDialog open={!!cancelDialogJobId} onOpenChange={(open) => { if (!open) setCancelDialogJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all remaining feed scan and prefetch processing for this job. Data already processed will be kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Running</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={!!actionLoading}
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
            >
              {actionLoading?.startsWith("cancel-") && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Job Dialog */}
      <AlertDialog open={!!deleteDialogJobId} onOpenChange={(open) => { if (!open) setDeleteDialogJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this job and all its associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={!!actionLoading}
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
            >
              {actionLoading?.startsWith("delete-") && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
