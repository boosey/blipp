import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { usePolling } from "@/hooks/use-polling";
import {
  RefreshCw,
  Inbox,
  ChevronRight,
  Newspaper,
  Zap,
  Copy,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";
import { relativeTime } from "@/lib/admin-formatters";
import { toast } from "sonner";
import type { AdminDigestDelivery, AdminDigestEpisode } from "@/types/admin/digest";

// ── Constants ──

type DigestStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

const STATUS_TABS: { value: DigestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY", label: "Ready" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_COLORS: Record<DigestStatus, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  PROCESSING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  READY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
};

const SOURCE_LABELS: Record<string, string> = {
  subscribed: "Sub",
  favorited: "Fav",
  recommended: "Rec",
};

const PAGE_SIZE = 20;

// ── Helpers ──

function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Loading Skeleton ──

function DigestsSkeleton() {
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

// ── Episode Row ──

function EpisodeRow({ episode }: { episode: AdminDigestEpisode }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3">
      {episode.podcastImageUrl ? (
        <img
          src={episode.podcastImageUrl}
          alt=""
          className="h-8 w-8 rounded shrink-0 object-cover"
        />
      ) : (
        <div className="h-8 w-8 rounded bg-white/5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#F9FAFB] truncate">{episode.episodeTitle}</div>
        <div className="text-[10px] text-[#9CA3AF] truncate">{episode.podcastTitle}</div>
      </div>
      <Badge
        variant="outline"
        className="text-[9px] border-white/10 text-[#9CA3AF] shrink-0"
      >
        {SOURCE_LABELS[episode.sourceType] ?? episode.sourceType}
      </Badge>
      <Badge
        variant="outline"
        className={cn("text-[9px] shrink-0", STATUS_COLORS[episode.status as DigestStatus] ?? "text-[#9CA3AF]")}
      >
        {episode.status}
      </Badge>
      {episode.entryStage && (
        <span className="text-[9px] text-[#9CA3AF]/60 shrink-0">{episode.entryStage}</span>
      )}
    </div>
  );
}

// ── Digest Row ──

function DigestRow({
  delivery,
  expanded,
  onToggle,
  detail,
  detailLoading,
}: {
  delivery: AdminDigestDelivery;
  expanded: boolean;
  onToggle: () => void;
  detail: AdminDigestDelivery | null;
  detailLoading: boolean;
}) {
  return (
    <div className="border-b border-white/5">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[24px_90px_1fr_80px_70px_100px] md:grid-cols-[24px_90px_1fr_80px_70px_100px] gap-3 px-3 py-2.5 text-xs hover:bg-white/[0.02] transition-colors items-center"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-[#9CA3AF] transition-transform",
            expanded && "rotate-90"
          )}
        />
        <Badge
          variant="outline"
          className={cn("text-[10px] justify-center w-fit", STATUS_COLORS[delivery.status as DigestStatus])}
        >
          {delivery.status}
        </Badge>
        <span className="text-left text-[#F9FAFB] truncate">
          {delivery.userName || delivery.userEmail || delivery.userId.slice(0, 8)}
        </span>
        <span className="text-[#9CA3AF]">
          {delivery.completedEpisodes}/{delivery.totalEpisodes} ep
        </span>
        <span className="text-[#9CA3AF]">{formatDuration(delivery.actualSeconds)}</span>
        <span className="text-[#9CA3AF] text-right">{relativeTime(delivery.createdAt)}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="bg-[#0F1D32] border-t border-white/5 px-3 pb-3 pl-10">
          {/* Delivery ID + metadata row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 mb-1">
            <span className="text-[10px] text-[#9CA3AF]/60 uppercase tracking-wider">Delivery</span>
            <code
              className="text-[10px] text-[#9CA3AF] font-mono cursor-pointer hover:text-[#F9FAFB] transition-colors"
              title="Click to copy full ID"
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(delivery.id); toast.success("Delivery ID copied"); }}
            >
              {delivery.id}
            </code>
            <Link
              to={`/admin/worker-logs?template=digest-logs&deliveryId=${delivery.id}`}
              className="text-[10px] text-[#3B82F6] hover:underline flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              View Logs <ExternalLink className="h-2.5 w-2.5" />
            </Link>
            <span className="text-[10px] text-[#9CA3AF] font-mono">{delivery.date}</span>
            {delivery.actualSeconds != null && (
              <span className="text-[10px] text-[#10B981] font-mono">{formatDuration(delivery.actualSeconds)}</span>
            )}
          </div>

          {/* Error message */}
          {detail?.errorMessage && (
            <div className="mb-2 px-2 py-1.5 rounded bg-[#EF4444]/10 border border-[#EF4444]/20">
              <p className="text-[10px] text-[#EF4444]">{detail.errorMessage}</p>
            </div>
          )}

          {/* Episode breakdown */}
          {detailLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 bg-white/5 rounded" />
              ))}
            </div>
          ) : detail?.episodes && detail.episodes.length > 0 ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-[#9CA3AF]/60 uppercase tracking-wider mb-1">
                Episodes ({detail.episodes.length})
              </div>
              <div className="rounded border border-white/5 divide-y divide-white/5 bg-white/[0.01]">
                {detail.episodes.map((ep) => (
                  <EpisodeRow key={ep.episodeId} episode={ep} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-[#9CA3AF] py-2">No episode data available</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger Dialog ──

function TriggerDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleTrigger = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/digests/trigger", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      onOpenChange(false);
      setEmail("");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1A2942] border border-white/10 rounded-lg p-6 w-full max-w-sm mx-4">
        <h3 className="text-sm font-semibold mb-4">Trigger Digest</h3>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="User email"
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60 mb-3"
          onKeyDown={(e) => { if (e.key === "Enter") handleTrigger(); }}
        />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onOpenChange(false); setEmail(""); setError(null); }}
            className="text-[#9CA3AF]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!email.trim() || loading}
            onClick={handleTrigger}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {loading ? "Triggering..." : "Trigger"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──

export default function Digests() {
  const apiFetch = useAdminFetch();

  const [deliveries, setDeliveries] = useState<AdminDigestDelivery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DigestStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AdminDigestDelivery>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      apiFetch<{ data: AdminDigestDelivery[]; total: number }>(`/digests?${params}`)
        .then((r) => {
          setDeliveries(r.data);
          setTotal(r.total);
        })
        .catch(console.error)
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [apiFetch, page, statusFilter]
  );

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => {
    load(true);
    if (expandedId) {
      apiFetch<{ data: AdminDigestDelivery }>(`/digests/${expandedId}`)
        .then((r) => setDetailCache((prev) => ({ ...prev, [expandedId]: r.data })))
        .catch(console.error);
    }
  }, 5_000);

  const toggleRow = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (!detailCache[id]) {
        setDetailLoading(true);
        apiFetch<{ data: AdminDigestDelivery }>(`/digests/${id}`)
          .then((r) => setDetailCache((prev) => ({ ...prev, [id]: r.data })))
          .catch(console.error)
          .finally(() => setDetailLoading(false));
      }
    },
    [expandedId, detailCache, apiFetch]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && deliveries.length === 0) return <DigestsSkeleton />;

  return (
    <div className="h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <Newspaper className="h-4 w-4 text-[#3B82F6]" />
          <span className="text-sm font-semibold">Digests</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {total} total
          </Badge>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Live
          </span>
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
            onClick={() => setTriggerOpen(true)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Trigger Digest</span>
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
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
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[24px_90px_1fr_80px_70px_100px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF] border-b border-white/5 bg-[#0F1D32]">
          <span />
          <span>Status</span>
          <span>User</span>
          <span>Episodes</span>
          <span>Duration</span>
          <span className="text-right">Created</span>
        </div>

        {/* Rows */}
        <ScrollArea className="flex-1">
          {deliveries.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
              <Inbox className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No digests found</span>
            </div>
          ) : (
            deliveries.map((d) => (
              <DigestRow
                key={d.id}
                delivery={d}
                expanded={expandedId === d.id}
                onToggle={() => toggleRow(d.id)}
                detail={detailCache[d.id] ?? null}
                detailLoading={detailLoading && expandedId === d.id && !detailCache[d.id]}
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

      {/* Trigger Dialog */}
      <TriggerDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        onSuccess={load}
      />
    </div>
  );
}
