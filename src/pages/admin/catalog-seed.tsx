import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
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

type PhaseStatus = "pending" | "active" | "complete" | "failed";

function getPhaseStatuses(status: string | undefined): [PhaseStatus, PhaseStatus, PhaseStatus] {
  if (!status || status === "pending") return ["pending", "pending", "pending"];
  if (status === "discovering" || status === "upserting") return ["active", "pending", "pending"];
  if (status === "feed_refresh") return ["complete", "active", "active"]; // Phase 2+3 overlap
  if (status === "complete") return ["complete", "complete", "complete"];
  if (status === "failed") return ["failed", "failed", "failed"];
  return ["pending", "pending", "pending"];
}

function PhaseIndicator({ status }: { status: PhaseStatus }) {
  if (status === "active") return <Loader2 className="h-5 w-5 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-5 w-5 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>;
  if (status === "failed") return <div className="h-5 w-5 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  return <div className="h-5 w-5 rounded-full border-2 border-[#9CA3AF]/30" />;
}

export default function CatalogSeed() {
  const apiFetch = useAdminFetch();
  const [data, setData] = useState<CatalogSeedProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const result = await apiFetch<CatalogSeedProgress>("/catalog-seed/active");
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const isActive = data?.job && !["complete", "failed"].includes(data.job.status);
  usePolling(fetchProgress, 3000, !!isActive);

  const startSeed = async () => {
    if (!window.confirm("This will wipe ALL catalog data (podcasts, episodes, subscriptions, briefings) and re-seed from scratch. Are you sure?")) return;
    setStarting(true);
    try {
      await apiFetch("/catalog-seed", { method: "POST", body: JSON.stringify({ confirm: true }) });
      await fetchProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start seed");
    } finally {
      setStarting(false);
    }
  };

  const job = data?.job;
  const [p1Status, p2Status, p3Status] = getPhaseStatuses(job?.status);

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
    if (job.status === "complete") defaultAccordion.push("discovery", "feed-refresh", "prefetch");
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
            <h2 className="text-xl font-semibold">Catalog Seed</h2>
            {elapsed && isActive && (
              <p className="text-sm text-[#9CA3AF] flex items-center gap-1">
                <Clock className="h-3 w-3" /> {elapsed} elapsed
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={startSeed}
          disabled={!!isActive || starting}
          className="bg-[#10B981] hover:bg-[#059669] text-white"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sprout className="h-4 w-4 mr-2" />}
          Start Seed
        </Button>
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
                {data?.recentPodcasts && data.recentPodcasts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">Recent Podcasts</p>
                    <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                      {data.recentPodcasts.map((p) => (
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
                {data?.recentEpisodes && data.recentEpisodes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">Recent Episodes</p>
                    <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                      {data.recentEpisodes.map((ep) => (
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
                {data?.recentPrefetch && data.recentPrefetch.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-[#9CA3AF] font-medium">Recent Prefetch Results</p>
                    <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                      {data.recentPrefetch.map((ep) => (
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
    </div>
  );
}
