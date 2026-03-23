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
  Loader2,
  Check,
  X,
  AlertCircle,
  Clock,
  Radio,
  Podcast,
  ChevronDown,
  Ban,
  Archive,
  Activity,
  Trash2,
  ArrowRight,
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
import { Link } from "react-router-dom";
import type {
  CatalogSeedJob,
  CatalogSeedJobList,
  CatalogSeedProgress,
  CatalogJobError,
} from "@/types/admin";

// ── Helpers ──

const SOURCE_COLORS: Record<string, string> = {
  apple: "#A855F7",
  "podcast-index": "#3B82F6",
  manual: "#F59E0B",
};

const SOURCE_LABELS: Record<string, string> = {
  apple: "Apple",
  "podcast-index": "Podcast Index",
  manual: "Manual",
};

function sourceBadgeStyle(source: string) {
  const color = SOURCE_COLORS[source] ?? "#6B7280";
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
  return ["pending", "discovering", "upserting"].includes(status);
}

function isTerminal(status: string): boolean {
  return ["complete", "failed", "cancelled"].includes(status);
}

function StatusIcon({ status }: { status: string }) {
  if (isActive(status)) return <Loader2 className="h-4 w-4 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-4 w-4 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "failed") return <div className="h-4 w-4 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "cancelled") return <div className="h-4 w-4 rounded-full bg-[#6B7280] flex items-center justify-center"><Ban className="h-2.5 w-2.5 text-white" /></div>;
  return <div className="h-4 w-4 rounded-full border-2 border-[#9CA3AF]/30" />;
}

function discoveryProgress(job: CatalogSeedJob): number {
  if (job.status === "complete") return 100;
  if (job.status === "upserting") return 80;
  if (job.status === "discovering") return job.podcastsDiscovered > 0 ? 50 : 20;
  if (job.status === "pending") return 5;
  return 0;
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
  const [detail, setDetail] = useState<CatalogSeedProgress | null>(null);
  const [errors, setErrors] = useState<CatalogJobError[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorPage, setErrorPage] = useState(1);
  const [loadingErrors, setLoadingErrors] = useState(false);

  // Accumulated podcast list
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

// ── Job Card ──

function JobCard({
  job,
  expanded,
  onToggle,
  onAction,
}: {
  job: CatalogSeedJob;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: string, jobId: string) => void;
}) {
  const elapsed = job.startedAt
    ? (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime()
    : 0;

  const active = isActive(job.status);
  const pct = discoveryProgress(job);

  return (
    <div className="rounded-lg border border-white/5 bg-[#1A2942] overflow-hidden">
      {/* Header row */}
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        {/* Source badge */}
        <Badge className="text-[10px] shrink-0" style={sourceBadgeStyle(job.source)}>
          {SOURCE_LABELS[job.source] ?? job.source}
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
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => onAction("cancel", job.id)}>
              <Ban className="h-3 w-3" />
            </Button>
          )}
          {isTerminal(job.status) && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[#9CA3AF] hover:bg-white/5" onClick={() => onAction("archive", job.id)}>
              <Archive className="h-3 w-3" />
            </Button>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Stats row + progress */}
      <div className="px-4 pb-3">
        <div className="text-[10px] text-[#9CA3AF] mb-1">
          {active ? (
            <span>Processing…</span>
          ) : job.podcastsDiscovered > 0 ? (
            <span>{job.podcastsDiscovered} new</span>
          ) : isTerminal(job.status) ? (
            <span>No new podcasts</span>
          ) : null}
        </div>
        {active && <Progress value={pct} className="h-1.5" />}
      </div>

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

export default function CatalogDiscoveryPage() {
  const apiFetch = useAdminFetch();
  const [jobs, setJobs] = useState<CatalogSeedJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [cancelDialogJobId, setCancelDialogJobId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const result = await apiFetch<CatalogSeedJobList>(`/catalog-seed?page=${page}&pageSize=20`);
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

  const hasActiveJobs = jobs.some((j) => isActive(j.status));
  usePolling(fetchJobs, 5000, hasActiveJobs);

  const hasCompleted = jobs.some((j) => j.status === "complete");
  const hasFailed = jobs.some((j) => j.status === "failed");

  // Actions
  const triggerApple = async () => {
    setActionLoading("apple");
    try {
      await apiFetch("/catalog-seed/trigger-apple", { method: "POST" });
      const pollEnd = Date.now() + 60000;
      const poll = setInterval(async () => {
        if (Date.now() > pollEnd) { clearInterval(poll); return; }
        await fetchJobs();
      }, 2000);
      setTimeout(() => clearInterval(poll), 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger Apple refresh");
    } finally {
      setActionLoading(null);
    }
  };

  const triggerPI = async () => {
    setActionLoading("pi");
    try {
      await apiFetch("/catalog-seed", {
        method: "POST",
        body: JSON.stringify({ confirm: true, source: "podcast-index", trigger: "admin", mode: "additive" }),
      });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger PI refresh");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCatalog = async () => {
    setDeleting(true);
    try {
      await apiFetch("/catalog-seed/catalog", {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete catalog");
    } finally {
      setDeleting(false);
    }
  };

  const bulkArchive = async (status: "complete" | "failed") => {
    setActionLoading(`archive-${status}`);
    try {
      await apiFetch("/catalog-seed/archive-bulk", {
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
    setActionLoading(`${action}-${jobId}`);
    try {
      await apiFetch(`/catalog-seed/${jobId}/${action}`, { method: "POST" });
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
      await apiFetch(`/catalog-seed/${cancelDialogJobId}/cancel`, { method: "POST" });
      setCancelDialogJobId(null);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
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
        <h2 className="text-xl font-semibold">Catalog Discovery</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={triggerApple}
            disabled={actionLoading === "apple"}
            className="bg-[#A855F7] hover:bg-[#9333EA] text-white"
          >
            {actionLoading === "apple" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Activity className="h-4 w-4 mr-1" />}
            Refresh from Apple
          </Button>
          <Button
            size="sm"
            onClick={triggerPI}
            disabled={actionLoading === "pi"}
            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white"
          >
            {actionLoading === "pi" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Radio className="h-4 w-4 mr-1" />}
            Refresh from Podcast Index
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Catalog
          </Button>
        </div>
      </div>

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
          <p className="text-[#9CA3AF] text-sm">No catalog jobs found.</p>
          <p className="text-[#9CA3AF]/60 text-xs mt-1">Use the buttons above to start a catalog refresh.</p>
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

      {/* Delete Catalog Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entire Catalog</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will permanently delete ALL catalog data:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>All podcasts and episodes</li>
                  <li>All subscriptions and feed items</li>
                  <li>All briefings and work products</li>
                  <li>All R2 stored content</li>
                </ul>
                <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 text-sm text-[#EF4444]">
                  This action cannot be undone. All user data will be lost.
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type <span className="font-mono font-bold">DELETE</span> to confirm:</label>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCatalog}
              disabled={deleteConfirmText !== "DELETE" || deleting}
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-50"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Job Dialog */}
      <AlertDialog open={!!cancelDialogJobId} onOpenChange={(open) => { if (!open) setCancelDialogJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all remaining discovery processing for this job. Data already processed will be kept. This cannot be undone.
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
    </div>
  );
}
