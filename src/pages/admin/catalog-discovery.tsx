import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  X,
  AlertCircle,
  Clock,
  Radio,
  Activity,
  Trash2,
  Archive,
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
import type { CatalogSeedJob, CatalogSeedJobList } from "@/types/admin";
import { JobCard, isActive } from "@/components/admin/catalog-discovery";

export default function CatalogDiscoveryPage() {
  const apiFetch = useAdminFetch();
  const [jobs, setJobs] = useState<CatalogSeedJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const triggerApple = async () => {
    setActionLoading("apple");
    const jobCountBefore = jobs.length;
    try {
      await apiFetch("/catalog-seed/trigger-apple", { method: "POST" });
      setError(null);
      // GitHub Action takes ~2 min (queue + run). Poll for 3 min with spinner.
      const pollEnd = Date.now() + 180000;
      const poll = setInterval(async () => {
        if (Date.now() > pollEnd) {
          clearInterval(poll);
          setActionLoading(null);
          return;
        }
        const result = await apiFetch<CatalogSeedJobList>(`/catalog-seed?page=1&pageSize=20`);
        setJobs(result.data);
        setTotal(result.total);
        // Stop polling once a new job appears
        if (result.data.length > jobCountBefore || result.data.some((j) => isActive(j.status) && j.source === "apple")) {
          clearInterval(poll);
          setActionLoading(null);
        }
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger Apple refresh");
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
          <Button size="sm" onClick={triggerApple} disabled={actionLoading === "apple"} className="bg-[#A855F7] hover:bg-[#9333EA] text-white">
            {actionLoading === "apple" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Activity className="h-4 w-4 mr-1" />}
            Refresh from Apple
          </Button>
          <Button size="sm" onClick={triggerPI} disabled={actionLoading === "pi"} className="bg-[#3B82F6] hover:bg-[#2563EB] text-white">
            {actionLoading === "pi" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Radio className="h-4 w-4 mr-1" />}
            Refresh from Podcast Index
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} className="text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10">
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Catalog
          </Button>
        </div>
      </div>

      {/* Bulk archive row */}
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs text-[#9CA3AF]">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
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
                  <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="font-mono" autoFocus />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCatalog} disabled={deleteConfirmText !== "DELETE" || deleting} className="bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-50">
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
            <AlertDialogAction onClick={confirmCancel} disabled={!!actionLoading} className="bg-[#EF4444] hover:bg-[#DC2626] text-white">
              {actionLoading?.startsWith("cancel-") && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
