import { useState, useEffect, useCallback } from "react";
import { Trash2, AlertTriangle, Loader2, Database, FileAudio, Package, Rss } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/admin-api";
import { relativeTime } from "@/lib/admin-formatters";
import type { DeletePreview, BriefingRequestStatus } from "@/types/admin";

function statusColor(status: BriefingRequestStatus) {
  switch (status) {
    case "COMPLETED": return "bg-[#10B981]/15 text-[#10B981]";
    case "PROCESSING": return "bg-[#3B82F6]/15 text-[#3B82F6]";
    case "FAILED": return "bg-[#EF4444]/15 text-[#EF4444]";
    default: return "bg-[#9CA3AF]/15 text-[#9CA3AF]";
  }
}

interface DeleteRequestDialogProps {
  requestId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteRequestDialog({ requestId, onClose, onDeleted }: DeleteRequestDialogProps) {
  const apiFetch = useAdminFetch();
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: DeletePreview }>(`/requests/${id}/delete-preview`);
      setPreview(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delete preview");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (requestId) {
      setPreview(null);
      loadPreview(requestId);
    }
  }, [requestId, loadPreview]);

  const handleDelete = useCallback(async () => {
    if (!requestId) return;
    setDeleting(true);
    try {
      await apiFetch(`/requests/${requestId}`, { method: "DELETE" });
      toast.success(`Deleted ${preview?.impactSummary.requestCount ?? 1} request(s) and cleaned up orphaned data`);
      onDeleted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [requestId, apiFetch, preview, onDeleted, onClose]);

  const s = preview?.impactSummary;

  return (
    <Dialog open={!!requestId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-[#0F1A2E] border-white/10 text-[#F9FAFB] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#EF4444]">
            <Trash2 className="h-5 w-5" />
            Delete Briefing Request
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            This will permanently delete the request and all related data.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-48 bg-white/5" />
            <Skeleton className="h-20 bg-white/5 rounded-lg" />
            <Skeleton className="h-16 bg-white/5 rounded-lg" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-4 py-2">
            {/* Related requests */}
            {preview.relatedRequests.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                  <span className="text-sm font-medium text-[#F59E0B]">
                    {preview.relatedRequests.length} other request{preview.relatedRequests.length > 1 ? "s" : ""} share work products
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] mb-2">
                  These requests reference the same work products and will also be deleted:
                </p>
                <div className="space-y-1.5 max-h-40 overflow-auto">
                  {preview.relatedRequests.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs rounded-md bg-white/[0.03] px-3 py-2">
                      <Badge className={cn("text-[9px] uppercase font-bold shrink-0", statusColor(r.status))}>
                        {r.status}
                      </Badge>
                      <span className="truncate flex-1 text-[#F9FAFB]/80">
                        {r.episodeTitle ?? r.podcastTitle ?? "Unknown"}
                      </span>
                      <span className="text-[#9CA3AF] shrink-0">{r.userName}</span>
                      <span className="text-[#9CA3AF] font-mono shrink-0">{relativeTime(r.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Impact summary */}
            {s && (
              <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                <span className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wider">Impact Summary</span>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-2">
                  <ImpactRow icon={Database} label="Requests" count={s.requestCount} />
                  <ImpactRow icon={Database} label="Pipeline Jobs" count={s.jobCount} />
                  <ImpactRow icon={Rss} label="Feed Items" count={s.feedItemCount} />
                  <ImpactRow icon={Database} label="Briefings" count={s.briefingCount} />
                  <ImpactRow icon={Package} label="Work Products" count={s.workProductCount} />
                  <ImpactRow icon={FileAudio} label="Clips" count={s.clipCount} />
                  <ImpactRow icon={Package} label="R2 Objects" count={s.r2ObjectCount} />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={deleting}
            className="text-[#9CA3AF] hover:text-[#F9FAFB]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={loading || deleting || !!error}
            className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white gap-1.5"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? "Deleting..." : `Delete ${s?.requestCount ?? 1} Request${(s?.requestCount ?? 1) > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImpactRow({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3 w-3 text-[#9CA3AF]" />
      <span className="text-[#9CA3AF]">{label}</span>
      <span className="font-mono tabular-nums text-[#F9FAFB] ml-auto">{count}</span>
    </div>
  );
}
