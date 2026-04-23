import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminFetch } from "@/lib/api-client";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  AlertCircle,
  Podcast,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { CatalogSeedProgress, CatalogJobError } from "@/types/admin";
import { isActive, isTerminal } from "./helpers";

export interface JobDetailProps {
  jobId: string;
}

export function JobDetail({ jobId }: JobDetailProps) {
  const apiFetch = useAdminFetch();
  const [detail, setDetail] = useState<CatalogSeedProgress | null>(null);
  const [errors, setErrors] = useState<CatalogJobError[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorPage, setErrorPage] = useState(1);
  const [loadingErrors, setLoadingErrors] = useState(false);

  const [allPodcasts, setAllPodcasts] = useState<CatalogSeedProgress["recentPodcasts"]>([]);
  const [podcastPage, setPodcastPage] = useState(1);
  const [loadingMorePodcasts, setLoadingMorePodcasts] = useState(false);
  const initialLoad = useRef(true);

  const fetchDetail = useCallback(async () => {
    try {
      const result = await apiFetch<CatalogSeedProgress>(`/catalog-seed/${jobId}`);
      setDetail(result);
      if (initialLoad.current) {
        setAllPodcasts(result.recentPodcasts ?? []);
        initialLoad.current = false;
      } else if (podcastPage === 1) {
        setAllPodcasts(result.recentPodcasts ?? []);
      }
    } catch {
      // Silently fail on detail polling
    }
  }, [apiFetch, jobId, podcastPage]);

  useEffect(() => { fetchDetail(); }, []);

  const jobActive = detail?.job && isActive(detail.job.status);
  usePolling(fetchDetail, 3000, !!jobActive);

  const fetchErrors = useCallback(async (page: number) => {
    setLoadingErrors(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50", phase: "discovery" });
      const result = await apiFetch<{ data: CatalogJobError[]; total: number }>(
        `/catalog-seed/${jobId}/errors?${params.toString()}`
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

  const loadMorePodcasts = useCallback(async () => {
    const nextPage = podcastPage + 1;
    setLoadingMorePodcasts(true);
    try {
      const params = new URLSearchParams({ podcastPage: String(nextPage) });
      const result = await apiFetch<CatalogSeedProgress>(`/catalog-seed/${jobId}?${params.toString()}`);
      setAllPodcasts((prev) => [...prev, ...(result.recentPodcasts ?? [])]);
      setPodcastPage(nextPage);
    } catch {
      // Revert silently
    } finally {
      setLoadingMorePodcasts(false);
    }
  }, [apiFetch, jobId, podcastPage]);

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  const job = detail.job;
  if (!job) return null;

  const errorCounts = detail.errorCounts ?? { discovery: 0, total: 0 };

  return (
    <div className="border-t border-white/5 px-4 pb-4 pt-3">
      {/* Refresh job link */}
      {isTerminal(job.status) && detail.refreshJob && (
        <Link
          to="/admin/episode-refresh"
          className="flex items-center gap-2 mb-3 rounded-lg border border-[#3B82F6]/20 bg-[#3B82F6]/5 p-2.5 text-sm text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors"
        >
          <span>Episode refresh started</span>
          <Badge variant="outline" className="text-[10px] text-[#3B82F6] border-[#3B82F6]/30">
            {detail.refreshJob.status}
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 ml-auto" />
        </Link>
      )}

      <Accordion type="multiple" defaultValue={["discovery"]} className="space-y-2">
        {/* Discovery */}
        <AccordionItem value="discovery" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex items-center gap-2 flex-1 text-left">
              <Podcast className="h-3.5 w-3.5 text-[#3B82F6]" />
              <span className="text-sm font-medium">Discovery</span>
              <Badge variant="outline" className="ml-auto mr-2 text-[#9CA3AF] border-white/10 text-[10px]">
                {detail.podcastsInserted} inserted
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#9CA3AF]">
                <span>New podcasts</span>
                <span>{job.podcastsDiscovered.toLocaleString()}</span>
              </div>
            </div>
            {allPodcasts.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] text-[#9CA3AF] font-medium">
                  New ({allPodcasts.length} of {detail.pagination?.podcastTotal ?? allPodcasts.length})
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
                        <p className="text-[10px] text-[#9CA3AF] truncate">
                          {p.author}{p.categories.length > 0 && ` · ${p.categories.slice(0, 2).join(", ")}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.pagination && allPodcasts.length < detail.pagination.podcastTotal && (
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={loadMorePodcasts} disabled={loadingMorePodcasts}>
                    {loadingMorePodcasts ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Load more ({detail.pagination.podcastTotal - allPodcasts.length})
                  </Button>
                )}
              </div>
            ) : isTerminal(job.status) ? (
              <p className="text-xs text-[#9CA3AF] text-center py-3">No new podcasts found — all already in catalog</p>
            ) : jobActive ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="h-3 w-3 animate-spin text-[#9CA3AF]" />
                <span className="text-xs text-[#9CA3AF]">Processing…</span>
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        {/* Errors */}
        <AccordionItem value="errors" className="rounded-lg border border-white/5 bg-[#0F1D32] overflow-hidden">
          <AccordionTrigger
            className="px-3 py-2 hover:no-underline"
            onClick={() => { if (errors.length === 0 && errorCounts.total > 0) fetchErrors(1); }}
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
                  <Button variant="ghost" size="sm" className="w-full text-[#9CA3AF] hover:text-white text-xs h-7" onClick={() => { const next = errorPage + 1; setErrorPage(next); fetchErrors(next); }} disabled={loadingErrors}>
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
