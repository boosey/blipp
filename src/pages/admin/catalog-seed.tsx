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
import {
  Sprout,
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
  Plus,
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
import { Input } from "@/components/ui/input";
import type { CatalogSeedProgress } from "@/types/admin";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

type PhaseStatus = "pending" | "active" | "complete" | "failed" | "paused" | "cancelled";

function getPhaseStatuses(status: string | undefined, feedsTotal?: number): [PhaseStatus, PhaseStatus, PhaseStatus] {
  if (!status || status === "pending") return ["pending", "pending", "pending"];
  if (status === "discovering" || status === "upserting") return ["active", "pending", "pending"];
  if (status === "feed_refresh") return ["complete", "active", "active"];
  if (status === "complete") return ["complete", "complete", "complete"];
  if (status === "failed") return ["failed", "failed", "failed"];
  if (status === "paused") {
    return (feedsTotal ?? 0) > 0
      ? ["complete", "paused", "paused"]
      : ["paused", "paused", "paused"];
  }
  if (status === "cancelled") {
    return (feedsTotal ?? 0) > 0
      ? ["complete", "cancelled", "cancelled"]
      : ["cancelled", "cancelled", "cancelled"];
  }
  return ["pending", "pending", "pending"];
}

function PhaseIndicator({ status }: { status: PhaseStatus }) {
  if (status === "active") return <Loader2 className="h-5 w-5 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-5 w-5 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>;
  if (status === "failed") return <div className="h-5 w-5 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  if (status === "paused") return <div className="h-5 w-5 rounded-full bg-[#F59E0B] flex items-center justify-center"><Pause className="h-3 w-3 text-white" /></div>;
  if (status === "cancelled") return <div className="h-5 w-5 rounded-full bg-[#6B7280] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  return <div className="h-5 w-5 rounded-full border-2 border-[#9CA3AF]/30" />;
}

export default function CatalogSeed() {
  const apiFetch = useAdminFetch();
  const [data, setData] = useState<CatalogSeedProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedMode, setSeedMode] = useState<"destructive" | "additive">("additive");
  const [seedConfirmText, setSeedConfirmText] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Accumulated lists across pages
  const [allPodcasts, setAllPodcasts] = useState<CatalogSeedProgress["recentPodcasts"]>([]);
  const [allEpisodes, setAllEpisodes] = useState<CatalogSeedProgress["recentEpisodes"]>([]);
  const [allPrefetch, setAllPrefetch] = useState<CatalogSeedProgress["recentPrefetch"]>([]);
  const [pages, setPages] = useState({ podcast: 1, episode: 1, prefetch: 1 });
  const [loadingMore, setLoadingMore] = useState({ podcast: false, episode: false, prefetch: false });

  // Track job ID to reset accumulated lists when job changes
  const currentJobId = useRef<string | null>(null);

  const fetchProgress = useCallback(async (overridePages?: { podcast?: number; episode?: number; prefetch?: number }) => {
    const p = { ...pages, ...overridePages };
    const params = new URLSearchParams();
    if (p.podcast > 1) params.set("podcastPage", String(p.podcast));
    if (p.episode > 1) params.set("episodePage", String(p.episode));
    if (p.prefetch > 1) params.set("prefetchPage", String(p.prefetch));
    const qs = params.toString();
    try {
      const result = await apiFetch<CatalogSeedProgress>(`/catalog-seed/active${qs ? `?${qs}` : ""}`);
      setData(result);
      setError(null);

      // Reset accumulated lists if job changed
      if (result.job && result.job.id !== currentJobId.current) {
        currentJobId.current = result.job.id;
        setAllPodcasts(result.recentPodcasts ?? []);
        setAllEpisodes(result.recentEpisodes ?? []);
        setAllPrefetch(result.recentPrefetch ?? []);
        setPages({ podcast: 1, episode: 1, prefetch: 1 });
      } else if (!overridePages) {
        // Polling refresh — only replace accumulated lists if still on page 1
        if (pages.podcast === 1) setAllPodcasts(result.recentPodcasts ?? []);
        if (pages.episode === 1) setAllEpisodes(result.recentEpisodes ?? []);
        if (pages.prefetch === 1) setAllPrefetch(result.recentPrefetch ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, pages]);

  useEffect(() => { fetchProgress(); }, []);

  const isActive = data?.job && !["complete", "failed", "cancelled"].includes(data.job.status);
  const pollInterval = data?.job?.status === "paused" ? 10000 : 3000;
  usePolling(fetchProgress, pollInterval, !!isActive);

  const loadMore = useCallback(async (type: "podcast" | "episode" | "prefetch") => {
    const nextPage = pages[type] + 1;
    const newPages = { ...pages, [type]: nextPage };
    setPages(newPages);
    setLoadingMore((prev) => ({ ...prev, [type]: true }));
    try {
      const params = new URLSearchParams();
      params.set(`${type === "podcast" ? "podcast" : type === "episode" ? "episode" : "prefetch"}Page`, String(nextPage));
      const result = await apiFetch<CatalogSeedProgress>(`/catalog-seed/active?${params.toString()}`);
      if (type === "podcast") setAllPodcasts((prev) => [...prev, ...(result.recentPodcasts ?? [])]);
      else if (type === "episode") setAllEpisodes((prev) => [...prev, ...(result.recentEpisodes ?? [])]);
      else setAllPrefetch((prev) => [...prev, ...(result.recentPrefetch ?? [])]);
    } catch {
      // Revert page on error
      setPages(pages);
    } finally {
      setLoadingMore((prev) => ({ ...prev, [type]: false }));
    }
  }, [apiFetch, pages]);

  const startSeed = async () => {
    setStarting(true);
    try {
      await apiFetch("/catalog-seed", { method: "POST", body: JSON.stringify({ confirm: true, mode: seedMode }) });
      setSeedDialogOpen(false);
      setSeedConfirmText("");
      setSeedMode("additive");
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start seed");
    } finally {
      setStarting(false);
    }
  };

  const pauseSeed = async () => {
    if (!job) return;
    setPausing(true);
    try {
      await apiFetch(`/catalog-seed/${job.id}/pause`, { method: "POST" });
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause");
    } finally {
      setPausing(false);
    }
  };

  const resumeSeed = async () => {
    if (!job) return;
    setResuming(true);
    try {
      await apiFetch(`/catalog-seed/${job.id}/resume`, { method: "POST" });
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  };

  const cancelSeed = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      await apiFetch(`/catalog-seed/${job.id}/cancel`, { method: "POST" });
      setCancelDialogOpen(false);
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const job = data?.job;
  const [p1Status, p2Status, p3Status] = getPhaseStatuses(job?.status, job?.feedsTotal);

  const elapsed = job?.startedAt
    ? formatDuration(
        (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) -
          new Date(job.startedAt).getTime()
      )
    : null;

  const defaultAccordion: string[] = [];
  if (p1Status === "active") defaultAccordion.push("discovery");
  if (p2Status === "active") defaultAccordion.push("feed-refresh");
  if (p3Status === "active") defaultAccordion.push("prefetch");
  if (defaultAccordion.length === 0 && job) {
    if (["complete", "paused", "cancelled"].includes(job.status)) defaultAccordion.push("discovery", "feed-refresh", "prefetch");
    else defaultAccordion.push("discovery");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sprout className="h-6 w-6 text-[#10B981]" />
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Catalog Seed
              {job && (
                <Badge variant="outline" className={job.mode === "additive" ? "text-[#10B981] border-[#10B981]/30 text-xs" : "text-[#EF4444] border-[#EF4444]/30 text-xs"}>
                  {job.mode === "additive" ? "Additive" : "Destructive"}
                </Badge>
              )}
            </h2>
            {elapsed && isActive && (
              <p className="text-sm text-[#9CA3AF] flex items-center gap-1">
                <Clock className="h-3 w-3" /> {elapsed} elapsed
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 1 active (including pending before queue picks up) — show disabled controls */}
          {job && ["pending", "discovering", "upserting"].includes(job.status) && (
            <>
              <Button variant="outline" size="sm" disabled title="Phase 1 completes in ~30s">
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button variant="outline" size="sm" disabled title="Phase 1 completes in ~30s" className="text-[#EF4444] border-[#EF4444]/30">
                <Ban className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </>
          )}

          {/* feed_refresh — Pause + Cancel */}
          {job?.status === "feed_refresh" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={pauseSeed}
                disabled={pausing}
                className="text-[#F59E0B] border-[#F59E0B]/30 hover:bg-[#F59E0B]/10"
              >
                {pausing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(true)}
                className="text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
              >
                <Ban className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </>
          )}

          {/* paused — Resume + Cancel */}
          {job?.status === "paused" && (
            <>
              <Button
                size="sm"
                onClick={resumeSeed}
                disabled={resuming}
                className="bg-[#10B981] hover:bg-[#059669] text-white"
              >
                {resuming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                Resume
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(true)}
                className="text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
              >
                <Ban className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </>
          )}

          {/* No active job — Start Seed (two modes) */}
          {(!job || ["complete", "failed", "cancelled"].includes(job.status)) && (
            <>
              <Button
                onClick={() => { setSeedMode("additive"); setSeedDialogOpen(true); }}
                disabled={starting}
                className="bg-[#10B981] hover:bg-[#059669] text-white"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add New
              </Button>
              <Button
                variant="outline"
                onClick={() => { setSeedMode("destructive"); setSeedDialogOpen(true); }}
                disabled={starting}
                className="text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sprout className="h-4 w-4 mr-2" />}
                Full Reseed
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {(error || job?.error) && (
        <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-[#EF4444]">Error</p>
            <p className="text-sm text-[#9CA3AF]">{error || job?.error}</p>
          </div>
        </div>
      )}

      {/* No job state */}
      {!job && !error && (
        <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-8 text-center">
          <Sprout className="h-12 w-12 text-[#9CA3AF]/30 mx-auto mb-3" />
          <p className="text-[#9CA3AF]">No seed jobs found. Click "Start Seed" to begin.</p>
        </div>
      )}

      {job && (
        <>
          {/* Phase Stepper */}
          <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-4">
            <div className="flex items-center justify-between max-w-md mx-auto">
              {/* Phase 1 */}
              <div className="flex flex-col items-center gap-1.5">
                <PhaseIndicator status={p1Status} />
                <span className="text-xs text-[#9CA3AF]">Discovery</span>
              </div>
              {/* Connector */}
              <div className="flex-1 h-px bg-white/10 mx-3 mt-[-12px]" />
              {/* Phase 2 */}
              <div className="flex flex-col items-center gap-1.5">
                <PhaseIndicator status={p2Status} />
                <span className="text-xs text-[#9CA3AF]">Feed Refresh</span>
              </div>
              {/* Connector */}
              <div className="flex-1 h-px bg-white/10 mx-3 mt-[-12px]" />
              {/* Phase 3 */}
              <div className="flex flex-col items-center gap-1.5">
                <PhaseIndicator status={p3Status} />
                <span className="text-xs text-[#9CA3AF]">Prefetch</span>
              </div>
            </div>
          </div>

          {/* Completion summary */}
          {job.status === "complete" && (
            <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-4 flex items-start gap-3">
              <Check className="h-5 w-5 text-[#10B981] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[#10B981]">Seed Complete</p>
                <p className="text-sm text-[#9CA3AF]">
                  {data?.podcastsInserted ?? 0} podcasts · {data?.episodesDiscovered ?? 0} episodes · {job.prefetchCompleted} prefetched
                  {elapsed && ` · ${elapsed}`}
                </p>
              </div>
            </div>
          )}

          {/* Paused banner */}
          {job.status === "paused" && (
            <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 flex items-start gap-3">
              <Pause className="h-5 w-5 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[#F59E0B]">Seed Paused</p>
                <p className="text-sm text-[#9CA3AF]">
                  {job.feedsCompleted} / {job.feedsTotal} feeds processed · {job.prefetchCompleted} prefetched.
                  Resume to continue processing.
                </p>
              </div>
            </div>
          )}

          {/* Cancelled banner */}
          {job.status === "cancelled" && (
            <div className="rounded-lg border border-[#6B7280]/30 bg-[#6B7280]/10 p-4 flex items-start gap-3">
              <Ban className="h-5 w-5 text-[#6B7280] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[#6B7280]">Seed Cancelled</p>
                <p className="text-sm text-[#9CA3AF]">
                  {data?.podcastsInserted ?? 0} podcasts and {data?.episodesDiscovered ?? 0} episodes were processed before cancellation.
                  {elapsed && ` Ran for ${elapsed}.`}
                </p>
              </div>
            </div>
          )}

          {/* Phase Cards */}
          <Accordion type="multiple" defaultValue={defaultAccordion} className="space-y-3">
            {/* Phase 1: Discovery */}
            <AccordionItem value="discovery" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Podcast className="h-4 w-4 text-[#3B82F6]" />
                  <span className="font-medium">Phase 1: Podcast Discovery</span>
                  <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10">
                    {data?.podcastsInserted ?? 0} inserted
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-[#9CA3AF]">
                    <span>Discovered</span>
                    <span>{job.podcastsDiscovered.toLocaleString()}</span>
                  </div>
                  <Progress value={job.podcastsDiscovered > 0 ? 100 : 0} />
                </div>
                {allPodcasts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">
                      Podcasts ({allPodcasts.length} of {data?.pagination?.podcastTotal ?? allPodcasts.length})
                    </p>
                    <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                      {allPodcasts.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                              <Podcast className="h-4 w-4 text-[#9CA3AF]/50" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{p.title}</p>
                            <p className="text-xs text-[#9CA3AF] truncate">
                              {p.author} {p.categories.length > 0 && `· ${p.categories.slice(0, 2).join(", ")}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {data?.pagination && allPodcasts.length < data.pagination.podcastTotal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-[#9CA3AF] hover:text-white"
                        onClick={() => loadMore("podcast")}
                        disabled={loadingMore.podcast}
                      >
                        {loadingMore.podcast ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        Load more ({data.pagination.podcastTotal - allPodcasts.length} remaining)
                      </Button>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 2: Feed Refresh */}
            <AccordionItem value="feed-refresh" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Radio className="h-4 w-4 text-[#F59E0B]" />
                  <span className="font-medium">Phase 2: Feed Refresh</span>
                  <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10">
                    {job.feedsCompleted} / {job.feedsTotal}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-[#9CA3AF]">
                    <span>Feeds processed</span>
                    <span>{job.feedsCompleted.toLocaleString()} / {job.feedsTotal.toLocaleString()}</span>
                  </div>
                  <Progress value={job.feedsTotal > 0 ? (job.feedsCompleted / job.feedsTotal) * 100 : 0} />
                </div>
                <p className="text-xs text-[#9CA3AF]">
                  Episodes found: {data?.episodesDiscovered?.toLocaleString() ?? 0}
                </p>
                {allEpisodes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">
                      Episodes ({allEpisodes.length} of {data?.pagination?.episodeTotal ?? allEpisodes.length})
                    </p>
                    <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                      {allEpisodes.map((ep) => (
                        <div key={ep.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                          {ep.podcast.imageUrl ? (
                            <img src={ep.podcast.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                              <Radio className="h-4 w-4 text-[#9CA3AF]/50" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">
                              <span className="text-[#9CA3AF]">{ep.podcast.title}</span> &rsaquo; {ep.title}
                            </p>
                            <p className="text-xs text-[#9CA3AF]">
                              {ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString() : "No date"}
                              {ep.durationSeconds && ` · ${Math.floor(ep.durationSeconds / 60)}:${String(ep.durationSeconds % 60).padStart(2, "0")}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {data?.pagination && allEpisodes.length < data.pagination.episodeTotal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-[#9CA3AF] hover:text-white"
                        onClick={() => loadMore("episode")}
                        disabled={loadingMore.episode}
                      >
                        {loadingMore.episode ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        Load more ({data.pagination.episodeTotal - allEpisodes.length} remaining)
                      </Button>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 3: Content Prefetch */}
            <AccordionItem value="prefetch" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <FileText className="h-4 w-4 text-[#8B5CF6]" />
                  <span className="font-medium">Phase 3: Content Prefetch</span>
                  <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10">
                    {job.prefetchCompleted} / {job.prefetchTotal}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-[#9CA3AF]">
                    <span>Prefetched</span>
                    <span>{job.prefetchCompleted.toLocaleString()} / {job.prefetchTotal.toLocaleString()}</span>
                  </div>
                  <Progress value={job.prefetchTotal > 0 ? (job.prefetchCompleted / job.prefetchTotal) * 100 : 0} />
                </div>
                {data?.prefetchBreakdown && Object.keys(data.prefetchBreakdown).length > 0 && (
                  <div className="flex gap-3 text-xs text-[#9CA3AF]">
                    {Object.entries(data.prefetchBreakdown).map(([status, count]) => (
                      <span key={status}>
                        {status === "HAS_TRANSCRIPT" ? "Transcripts" : status === "HAS_AUDIO" ? "Audio" : status}: {count}
                      </span>
                    ))}
                  </div>
                )}
                {allPrefetch.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">
                      Prefetch Results ({allPrefetch.length} of {data?.pagination?.prefetchTotal ?? allPrefetch.length})
                    </p>
                    <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                      {allPrefetch.map((ep) => (
                        <div key={ep.id} className="flex items-center gap-2 rounded p-1.5 bg-white/[0.02]">
                          {ep.podcast.imageUrl ? (
                            <img src={ep.podcast.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-[#9CA3AF]/50" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">
                              <span className="text-[#9CA3AF]">{ep.podcast.title}</span> &rsaquo; {ep.title}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              ep.contentStatus === "HAS_TRANSCRIPT"
                                ? "text-[#10B981] border-[#10B981]/30"
                                : ep.contentStatus === "HAS_AUDIO"
                                  ? "text-[#3B82F6] border-[#3B82F6]/30"
                                  : "text-[#9CA3AF] border-white/10"
                            }
                          >
                            {ep.contentStatus === "HAS_TRANSCRIPT"
                              ? "Transcript"
                              : ep.contentStatus === "HAS_AUDIO"
                                ? "Audio"
                                : ep.contentStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {data?.pagination && allPrefetch.length < data.pagination.prefetchTotal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-[#9CA3AF] hover:text-white"
                        onClick={() => loadMore("prefetch")}
                        disabled={loadingMore.prefetch}
                      >
                        {loadingMore.prefetch ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        Load more ({data.pagination.prefetchTotal - allPrefetch.length} remaining)
                      </Button>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Last seed info for completed jobs */}
          {job.status === "complete" && job.completedAt && (
            <p className="text-center text-sm text-[#9CA3AF]">
              Last seed: {new Date(job.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {data?.podcastsInserted ?? 0} podcasts
            </p>
          )}
        </>
      )}

      {/* Start Seed Confirmation Dialog */}
      <AlertDialog open={seedDialogOpen} onOpenChange={(open) => { setSeedDialogOpen(open); if (!open) setSeedConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {seedMode === "destructive" ? "Full Reseed" : "Add New Podcasts"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {seedMode === "additive" ? (
                  <>
                    <p>This will discover trending podcasts and add any that aren't already in the catalog. Existing data is untouched.</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Discover trending podcasts from Podcast Index</li>
                      <li>Insert only new podcasts not already in catalog</li>
                      <li>Fetch RSS feeds and prefetch content for new podcasts</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p>This will run a full destructive catalog reseed:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Wipe all existing catalog data</li>
                      <li>Discover trending podcasts from Podcast Index</li>
                      <li>Fetch RSS feeds and prefetch content</li>
                    </ol>
                    <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 text-sm text-[#EF4444]">
                      Warning: This wipes ALL existing catalog data — podcasts, episodes, subscriptions, briefings, and R2 work products.
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Type <span className="font-mono font-bold">SEED</span> to confirm:</label>
                      <Input
                        value={seedConfirmText}
                        onChange={(e) => setSeedConfirmText(e.target.value)}
                        placeholder="SEED"
                        className="font-mono"
                        autoFocus
                      />
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {seedMode === "additive" ? (
              <AlertDialogAction
                onClick={startSeed}
                disabled={starting}
                className="bg-[#10B981] hover:bg-[#059669] text-white disabled:opacity-50"
              >
                {starting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Add New Podcasts
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={startSeed}
                disabled={seedConfirmText !== "SEED" || starting}
                className="bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-50"
              >
                {starting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Full Reseed
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Catalog Seed</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all remaining feed refresh and prefetch processing. Data already inserted will be kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Running</AlertDialogCancel>
            <AlertDialogAction
              onClick={cancelSeed}
              disabled={cancelling}
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white"
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel Seed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
