import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/lib/api-client";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  X,
  AlertCircle,
  Clock,
  Archive,
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
import { JobCard } from "@/components/admin/episode-refresh/job-card";
import { isActive } from "@/components/admin/episode-refresh/helpers";
import type { EpisodeRefreshJob, EpisodeRefreshJobList } from "@/types/admin";

export default function EpisodeRefreshPage() {
  const apiFetch = useAdminFetch();
  const [jobs, setJobs] = useState<EpisodeRefreshJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const triggerRefresh = async (scope: "subscribed" | "all") => {
    setActionLoading(scope);
    try {
      await apiFetch("/episode-refresh", { method: "POST", body: JSON.stringify({ scope }) });
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
      await apiFetch("/episode-refresh/archive-bulk", { method: "POST", body: JSON.stringify({ status }) });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setActionLoading(null);
    }
  };

  const handleJobAction = async (action: string, jobId: string) => {
    if (action === "cancel") { setCancelDialogJobId(jobId); return; }
    if (action === "delete") { setDeleteDialogJobId(jobId); return; }
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Episode Refresh</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => triggerRefresh("subscribed")} disabled={actionLoading === "subscribed"} className="bg-[#10B981] hover:bg-[#059669] text-white">
            {actionLoading === "subscribed" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh Subscribed
          </Button>
          <Button size="sm" onClick={() => triggerRefresh("all")} disabled={actionLoading === "all"} className="bg-[#3B82F6] hover:bg-[#2563EB] text-white">
            {actionLoading === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh All
          </Button>
        </div>
      </div>

      <FeedRefreshCard compact />

      {(hasCompleted || hasFailed) && (
        <div className="flex items-center gap-2">
          {hasCompleted && (
            <Button variant="outline" size="sm" onClick={() => bulkArchive("complete")} disabled={actionLoading === "archive-complete"} className="text-[#9CA3AF] border-white/10 hover:bg-white/5 text-xs">
              {actionLoading === "archive-complete" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Archive className="h-3 w-3 mr-1" />}
              Archive Completed
            </Button>
          )}
          {hasFailed && (
            <Button variant="outline" size="sm" onClick={() => bulkArchive("failed")} disabled={actionLoading === "archive-failed"} className="text-[#9CA3AF] border-white/10 hover:bg-white/5 text-xs">
              {actionLoading === "archive-failed" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Archive className="h-3 w-3 mr-1" />}
              Archive Failed
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-sm text-[#EF4444]">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-[#EF4444] hover:text-[#EF4444]/70">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-[#0F1D32] p-12 text-center">
          <Clock className="h-10 w-10 text-[#9CA3AF]/30 mx-auto mb-3" />
          <p className="text-[#9CA3AF] text-sm">No episode refresh jobs found.</p>
          <p className="text-[#9CA3AF]/60 text-xs mt-1">Use the buttons above to start an episode refresh.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} expanded={expandedId === job.id} onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)} onAction={handleJobAction} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs text-[#9CA3AF]">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

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
            <AlertDialogAction onClick={confirmCancel} disabled={!!actionLoading} className="bg-[#EF4444] hover:bg-[#DC2626] text-white">
              {actionLoading?.startsWith("cancel-") && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogAction onClick={confirmDelete} disabled={!!actionLoading} className="bg-[#EF4444] hover:bg-[#DC2626] text-white">
              {actionLoading?.startsWith("delete-") && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
