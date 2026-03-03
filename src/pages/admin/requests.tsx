import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  BriefingRequest,
  BriefingRequestStatus,
  EpisodeProgress,
  StageProgress,
  AdminPodcast,
} from "@/types/admin";

// ── Constants ──

const STATUS_TABS: { value: BriefingRequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_STYLES: Record<
  BriefingRequestStatus,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: "#9CA3AF20", text: "#9CA3AF" },
  PROCESSING: { bg: "#3B82F620", text: "#3B82F6", pulse: true },
  COMPLETED: { bg: "#10B98120", text: "#10B981" },
  FAILED: { bg: "#EF444420", text: "#EF4444" },
};

const STAGE_STATUS_ICON: Record<
  StageProgress["status"],
  { icon: React.ElementType; color: string; label: string }
> = {
  COMPLETED: { icon: CheckCircle2, color: "#10B981", label: "Done" },
  IN_PROGRESS: { icon: Loader2, color: "#3B82F6", label: "Running" },
  WAITING: { icon: Clock, color: "#9CA3AF", label: "Waiting" },
  FAILED: { icon: XCircle, color: "#EF4444", label: "Failed" },
};

const PAGE_SIZE = 20;

// ── Helpers ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ──

function StatusBadge({ status }: { status: BriefingRequestStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

function StageIcon({ stage }: { stage: StageProgress }) {
  const cfg = STAGE_STATUS_ICON[stage.status];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1" title={cfg.label}>
      <Icon
        className={cn("h-3.5 w-3.5", stage.status === "IN_PROGRESS" && "animate-spin")}
        style={{ color: cfg.color }}
      />
      <span className="text-[10px]" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </span>
  );
}

function EpisodeProgressTree({ episodes }: { episodes: EpisodeProgress[] }) {
  if (!episodes || episodes.length === 0) {
    return (
      <div className="text-[10px] text-[#9CA3AF] py-2">No episode progress data</div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {episodes.map((ep, idx) => {
        const isLast = idx === episodes.length - 1;
        return (
          <div key={ep.episodeId} className="pl-2">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[#9CA3AF] font-mono">{isLast ? "\u2514\u2500" : "\u251C\u2500"}</span>
              <span className="text-[#F9FAFB] font-medium truncate">
                {ep.episodeTitle}
              </span>
              <span className="text-[10px] text-[#9CA3AF] truncate">
                ({ep.podcastTitle})
              </span>
            </div>
            <div className="pl-6 space-y-0.5 mt-1">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[#9CA3AF] font-mono">{isLast ? " " : "\u2502"} \u251C\u2500</span>
                <span className="text-[#9CA3AF] w-24">Transcription:</span>
                <StageIcon stage={ep.transcription} />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[#9CA3AF] font-mono">{isLast ? " " : "\u2502"} \u251C\u2500</span>
                <span className="text-[#9CA3AF] w-24">Distillation:</span>
                <StageIcon stage={ep.distillation} />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[#9CA3AF] font-mono">{isLast ? " " : "\u2502"} \u2514\u2500</span>
                <span className="text-[#9CA3AF] w-24">Clip Gen:</span>
                <StageIcon stage={ep.clipGeneration} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RequestRow({
  request,
  expanded,
  onToggle,
  detail,
  detailLoading,
}: {
  request: BriefingRequest;
  expanded: boolean;
  onToggle: () => void;
  detail: BriefingRequest | null;
  detailLoading: boolean;
}) {
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[24px_100px_1fr_80px_60px_80px_100px] gap-3 items-center px-3 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={request.status} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#F9FAFB] truncate">
            {request.userEmail ?? request.userId}
          </span>
          {request.isTest && (
            <Badge className="bg-[#F97316]/15 text-[#F97316] text-[9px] shrink-0">
              Test
            </Badge>
          )}
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {request.targetMinutes}m
        </div>
        <div className="text-xs text-[#9CA3AF] font-mono tabular-nums">
          {request.podcastIds.length}
        </div>
        <div className="text-xs text-[#9CA3AF]">
          {request.isTest ? "Test" : "User"}
        </div>
        <div className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
          {relativeTime(request.createdAt)}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-10 bg-white/[0.01]">
          {detailLoading ? (
            <div className="space-y-1 py-2">
              <Skeleton className="h-4 w-full bg-white/5" />
              <Skeleton className="h-4 w-3/4 bg-white/5" />
              <Skeleton className="h-4 w-1/2 bg-white/5" />
            </div>
          ) : detail?.episodeProgress ? (
            <EpisodeProgressTree episodes={detail.episodeProgress} />
          ) : (
            <div className="text-[10px] text-[#9CA3AF] py-2">
              No episode progress data available
            </div>
          )}
          {detail?.errorMessage && (
            <div className="mt-2 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2">
              <pre className="text-[10px] text-[#EF4444]/80 font-mono whitespace-pre-wrap break-all">
                {detail.errorMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Test Briefing Dialog ──

function TestBriefingDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [podcasts, setPodcasts] = useState<AdminPodcast[]>([]);
  const [loadingPodcasts, setLoadingPodcasts] = useState(false);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(new Set());
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingPodcasts(true);
    apiFetch<{ data: AdminPodcast[] }>("/podcasts")
      .then((r) => setPodcasts(r.data))
      .catch(console.error)
      .finally(() => setLoadingPodcasts(false));
  }, [open, apiFetch]);

  const togglePodcast = (id: string) => {
    setSelectedPodcasts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedPodcasts.size === 0) return;
    setSubmitting(true);
    try {
      await apiFetch("/requests/test-briefing", {
        method: "POST",
        body: JSON.stringify({
          podcastIds: Array.from(selectedPodcasts),
          targetMinutes,
        }),
      });
      onOpenChange(false);
      setSelectedPodcasts(new Set());
      setTargetMinutes(5);
      onSuccess();
    } catch (e) {
      console.error("Failed to create test briefing:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB] text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#F97316]" />
            Create Test Briefing
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duration input */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-[#F9FAFB] font-medium">Duration (minutes)</label>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">1-30 minutes</p>
            </div>
            <Input
              type="number"
              min={1}
              max={30}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Math.min(30, Math.max(1, Number(e.target.value))))}
              className="w-20 h-8 text-xs bg-[#0F1D32] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
            />
          </div>

          <Separator className="bg-white/5" />

          {/* Podcast picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#F9FAFB] font-medium">Select Podcasts</label>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
                {selectedPodcasts.size} selected
              </Badge>
            </div>

            <ScrollArea className="h-60 rounded-md border border-white/5 bg-[#0F1D32]">
              <div className="p-2 space-y-0.5">
                {loadingPodcasts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-white/5 rounded" />
                  ))
                ) : podcasts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[#9CA3AF]">
                    <Inbox className="h-5 w-5 mb-1.5 opacity-40" />
                    <span className="text-[10px]">No podcasts found</span>
                  </div>
                ) : (
                  podcasts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => togglePodcast(p.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors text-left",
                        selectedPodcasts.has(p.id)
                          ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20"
                          : "hover:bg-white/[0.03] border border-transparent"
                      )}
                    >
                      <Checkbox
                        checked={selectedPodcasts.has(p.id)}
                        className="data-[state=checked]:bg-[#3B82F6] data-[state=checked]:border-[#3B82F6]"
                        tabIndex={-1}
                      />
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-7 w-7 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded bg-white/5 shrink-0" />
                      )}
                      <span className="text-xs text-[#F9FAFB] truncate">{p.title}</span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedPodcasts.size === 0}
            className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {submitting ? "Creating..." : "Create Test Briefing"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading Skeleton ──

function RequestsSkeleton() {
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
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

  const [requests, setRequests] = useState<BriefingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<BriefingRequestStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, BriefingRequest>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    apiFetch<{ data: BriefingRequest[]; total: number }>(`/requests?${params}`)
      .then((r) => {
        setRequests(r.data);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Requests</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
            {total} total
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setTestDialogOpen(true)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Test Briefing
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
        {/* Table header */}
        <div className="grid grid-cols-[24px_100px_1fr_80px_60px_80px_100px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF] border-b border-white/5 bg-[#0F1D32]">
          <span />
          <span>Status</span>
          <span>User</span>
          <span>Duration</span>
          <span>Pods</span>
          <span>Type</span>
          <span>Created</span>
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
                detail={detailCache[req.id] ?? null}
                detailLoading={detailLoading && expandedId === req.id && !detailCache[req.id]}
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
    </div>
  );
}
