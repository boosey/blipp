import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { usePolling } from "@/hooks/use-polling";
import {
  FlaskConical,
  RefreshCw,
  Inbox,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";
import { DeleteRequestDialog } from "@/components/admin/delete-request-dialog";
import { RequestRow } from "@/components/admin/requests/request-row";
import { TestBriefingDialog } from "@/components/admin/requests/test-briefing-dialog";
import type {
  BriefingRequest,
  BriefingRequestStatus,
} from "@/types/admin";

// ── Constants ──

const STATUS_TABS: { value: BriefingRequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

const PAGE_SIZE = 20;

// ── Loading Skeleton ──

function RequestsSkeleton() {
  return (
    <div className="h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-60 bg-white/5 rounded" />
        <Skeleton className="h-8 w-32 bg-white/5 rounded" />
      </div>
      <div className="flex-1 bg-[#1A2942] border border-white/5 rounded-lg">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-3 py-3 border-b border-white/5">
            <Skeleton className="h-5 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──

export default function Requests() {
  const apiFetch = useAdminFetch();
  const [searchParams] = useSearchParams();

  const [requests, setRequests] = useState<BriefingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<BriefingRequestStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, BriefingRequest>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Global event display toggles (apply to all EventTimeline instances)
  const [globalShowDebug, setGlobalShowDebug] = useState(false);
  const [globalShowDetails, setGlobalShowDetails] = useState(false);

  // Deep-link state
  const deepLinkRequestId = searchParams.get("requestId");
  const deepLinkJobId = searchParams.get("jobId");
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const jobScrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    apiFetch<{ data: BriefingRequest[]; total: number }>(`/requests?${params}`)
      .then((r) => {
        setRequests(r.data);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [apiFetch, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => {
    load(true);
    if (expandedId) {
      apiFetch<{ data: BriefingRequest }>(`/requests/${expandedId}`)
        .then((r) => setDetailCache((prev) => ({ ...prev, [expandedId]: r.data })))
        .catch(console.error);
    }
  }, 5_000);

  // Deep-link: fetch the target request directly (avoids pagination miss) and auto-expand
  useEffect(() => {
    if (!deepLinkRequestId || deepLinkHandled) return;
    setDeepLinkHandled(true);
    apiFetch<{ data: BriefingRequest }>(`/requests/${deepLinkRequestId}`)
      .then((r) => {
        const detail = r.data;
        // Inject into list if not present
        setRequests((prev) =>
          prev.some((req) => req.id === detail.id)
            ? prev
            : [detail, ...prev]
        );
        setDetailCache((prev) => ({ ...prev, [detail.id]: detail }));
        setExpandedId(detail.id);
      })
      .catch(console.error);
  }, [deepLinkRequestId, deepLinkHandled, apiFetch]);

  // Scroll to the highlighted job once the detail is loaded and rendered
  useEffect(() => {
    if (!deepLinkJobId || !deepLinkRequestId) return;
    const detail = detailCache[deepLinkRequestId];
    if (!detail?.jobProgress) return;
    // Wait a tick for DOM to render the expanded content
    const timer = setTimeout(() => {
      jobScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [deepLinkJobId, deepLinkRequestId, detailCache]);

  const toggleRow = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (!detailCache[id]) {
        setDetailLoading(true);
        apiFetch<{ data: BriefingRequest }>(`/requests/${id}`)
          .then((r) => {
            setDetailCache((prev) => ({ ...prev, [id]: r.data }));
          })
          .catch(console.error)
          .finally(() => setDetailLoading(false));
      }
    },
    [expandedId, detailCache, apiFetch]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && requests.length === 0) return <RequestsSkeleton />;

  return (
    <div className="h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-sm font-semibold">Requests</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {total} total
          </Badge>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Live
          </span>
          <span className="hidden md:inline text-[#3F3F46] mx-1">|</span>
          <button
            onClick={() => setGlobalShowDebug((v) => !v)}
            className={cn(
              "hidden md:inline-flex items-center gap-1 text-[10px] transition-colors",
              globalShowDebug ? "text-[#9CA3AF]" : "text-[#9CA3AF]/40 hover:text-[#9CA3AF]/70"
            )}
          >
            <Eye className="h-2.5 w-2.5" />
            Debug
          </button>
          <button
            onClick={() => setGlobalShowDetails((v) => !v)}
            className={cn(
              "hidden md:inline-flex items-center gap-1 text-[10px] transition-colors",
              globalShowDetails ? "text-[#9CA3AF]" : "text-[#9CA3AF]/40 hover:text-[#9CA3AF]/70"
            )}
          >
            <Eye className="h-2.5 w-2.5" />
            Details
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={() => { setRefreshing(true); load(); }}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            onClick={() => setTestDialogOpen(true)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Test Briefing</span>
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
              statusFilter === tab.value
                ? "bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30"
                : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 border border-transparent"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 bg-[#1A2942] border border-white/5 rounded-lg flex flex-col min-h-0 overflow-hidden">
        {/* Table header – desktop only */}
        <div className="hidden md:grid grid-cols-[24px_100px_1fr_80px_60px_80px_80px_100px_32px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF] border-b border-white/5 bg-[#0F1D32]">
          <span />
          <span>Status</span>
          <span>User</span>
          <span>Duration</span>
          <span>Items</span>
          <span>Type</span>
          <span>Cost</span>
          <span>Created</span>
          <span />
        </div>

        {/* Rows */}
        <ScrollArea className="flex-1">
          {requests.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
              <Inbox className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No requests found</span>
            </div>
          ) : (
            requests.map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                expanded={expandedId === req.id}
                onToggle={() => toggleRow(req.id)}
                onDelete={() => setDeleteTargetId(req.id)}
                detail={detailCache[req.id] ?? null}
                detailLoading={detailLoading && expandedId === req.id && !detailCache[req.id]}
                highlightJobId={expandedId === req.id ? deepLinkJobId : null}
                jobRef={expandedId === req.id ? jobScrollRef : undefined}
                showDebug={globalShowDebug}
                showDetails={globalShowDetails}
              />
            ))
          )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-[#0F1D32]">
            <span className="text-[10px] text-[#9CA3AF]">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs h-7 px-2"
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs h-7 px-2"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Test Briefing Dialog */}
      <TestBriefingDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        onSuccess={load}
      />

      {/* Delete Request Dialog */}
      <DeleteRequestDialog
        requestId={deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onDeleted={load}
      />
    </div>
  );
}
