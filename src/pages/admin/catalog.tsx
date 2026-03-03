import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Grid3X3,
  List,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  RefreshCw,
  Pause,
  Archive,
  Trash2,
  Heart,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Rss,
  X,
  Loader2,
  LayoutGrid,
  Activity,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminPodcast,
  AdminPodcastDetail,
  CatalogFilters,
  CatalogStats,
  FeedHealth,
  PodcastStatus,
  PaginatedResponse,
  ActivityEvent,
} from "@/types/admin";

// ── Constants ──

const HEALTH_CONFIG: Record<FeedHealth, { color: string; label: string }> = {
  excellent: { color: "#10B981", label: "Excellent" },
  good: { color: "#3B82F6", label: "Good" },
  fair: { color: "#F59E0B", label: "Fair" },
  poor: { color: "#F97316", label: "Poor" },
  broken: { color: "#EF4444", label: "Broken" },
};

const STATUS_LABELS: Record<PodcastStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

// ── Helpers ──

function relativeTime(iso: string | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function HealthBadge({ health }: { health: FeedHealth | undefined }) {
  if (!health) return null;
  const cfg = HEALTH_CONFIG[health];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: PodcastStatus }) {
  const color = status === "active" ? "#10B981" : status === "paused" ? "#F59E0B" : "#9CA3AF";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Filter Sidebar ──

function FilterSidebar({
  filters,
  stats,
  onFilterChange,
  collapsed,
  onToggle,
}: {
  filters: CatalogFilters;
  stats: CatalogStats | null;
  onFilterChange: (f: CatalogFilters) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const activeFilters = Object.entries(filters).filter(([_, v]) => v != null && v !== "" && (!Array.isArray(v) || v.length > 0));

  return (
    <div className={cn(
      "rounded-lg bg-[#1A2942] border border-white/5 flex flex-col transition-all duration-200 shrink-0 overflow-hidden",
      collapsed ? "w-10" : "w-[280px]"
    )}>
      {collapsed ? (
        <Button variant="ghost" size="icon" onClick={onToggle} className="w-10 h-10 text-[#9CA3AF] hover:text-[#F9FAFB]">
          <Filter className="h-4 w-4" />
        </Button>
      ) : (
        <>
          <div className="flex items-center justify-between p-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#3B82F6]" />
              <span className="text-xs font-semibold">Filters</span>
              {activeFilters.length > 0 && (
                <Badge className="bg-[#3B82F6]/15 text-[#3B82F6] text-[10px]">{activeFilters.length}</Badge>
              )}
            </div>
            <Button variant="ghost" size="icon-xs" onClick={onToggle} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>

          {/* Applied filter badges */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pt-2">
              {activeFilters.map(([key]) => (
                <Badge
                  key={key}
                  className="bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] gap-1 cursor-pointer hover:bg-[#3B82F6]/20"
                  onClick={() => onFilterChange({ ...filters, [key]: undefined })}
                >
                  {key}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
              <Badge
                className="bg-white/5 text-[#9CA3AF] text-[10px] cursor-pointer hover:bg-white/10"
                onClick={() => onFilterChange({})}
              >
                Clear all
              </Badge>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[#9CA3AF]" />
                <Input
                  placeholder="Search podcasts..."
                  value={filters.search ?? ""}
                  onChange={(e) => onFilterChange({ ...filters, search: e.target.value || undefined })}
                  className="pl-7 h-7 text-xs bg-white/5 border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
                />
              </div>

              {/* Feed Health Chart */}
              {stats && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Feed Health</span>
                  <div className="mt-2 space-y-1.5">
                    {(Object.keys(HEALTH_CONFIG) as FeedHealth[]).map((h) => {
                      const count = stats.byHealth[h] ?? 0;
                      const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                      const active = filters.health?.includes(h);
                      return (
                        <button
                          key={h}
                          onClick={() => {
                            const current = filters.health ?? [];
                            const next = active ? current.filter((x) => x !== h) : [...current, h];
                            onFilterChange({ ...filters, health: next.length > 0 ? next : undefined });
                          }}
                          className={cn(
                            "flex items-center gap-2 w-full text-left rounded px-1.5 py-1 transition-colors",
                            active ? "bg-white/5" : "hover:bg-white/[0.03]"
                          )}
                        >
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: HEALTH_CONFIG[h].color }} />
                          <span className="text-[10px] text-[#9CA3AF] flex-1">{HEALTH_CONFIG[h].label}</span>
                          <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: HEALTH_CONFIG[h].color }}
                            />
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-6 text-right">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Separator className="bg-white/5" />

              {/* Status */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Status</span>
                <div className="mt-2 space-y-1">
                  {(["active", "paused", "archived"] as PodcastStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        const current = filters.status ?? [];
                        const active = current.includes(s);
                        const next = active ? current.filter((x) => x !== s) : [...current, s];
                        onFilterChange({ ...filters, status: next.length > 0 ? next : undefined });
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full text-left rounded px-1.5 py-1 text-[11px] transition-colors",
                        filters.status?.includes(s) ? "bg-white/5 text-[#F9FAFB]" : "text-[#9CA3AF] hover:bg-white/[0.03]"
                      )}
                    >
                      <span className={cn(
                        "h-3 w-3 rounded border flex items-center justify-center",
                        filters.status?.includes(s) ? "border-[#3B82F6] bg-[#3B82F6]" : "border-white/20"
                      )}>
                        {filters.status?.includes(s) && <CheckCircle2 className="h-2 w-2 text-white" />}
                      </span>
                      {STATUS_LABELS[s]}
                      {stats && <span className="ml-auto font-mono text-[10px]">{stats.byStatus[s] ?? 0}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Activity */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Activity</span>
                <div className="mt-2 space-y-1">
                  {[
                    { value: "today", label: "Updated Today" },
                    { value: "this_week", label: "This Week" },
                    { value: "stale", label: "Stale (>7d)" },
                    { value: "inactive", label: "Inactive (>30d)" },
                  ].map((a) => (
                    <button
                      key={a.value}
                      onClick={() => onFilterChange({ ...filters, activity: filters.activity === a.value ? undefined : a.value as CatalogFilters["activity"] })}
                      className={cn(
                        "flex items-center gap-2 w-full text-left rounded px-1.5 py-1 text-[11px] transition-colors",
                        filters.activity === a.value ? "bg-white/5 text-[#F9FAFB]" : "text-[#9CA3AF] hover:bg-white/[0.03]"
                      )}
                    >
                      <span className={cn(
                        "h-2 w-2 rounded-full border",
                        filters.activity === a.value ? "border-[#3B82F6] bg-[#3B82F6]" : "border-white/20"
                      )} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Issues toggle */}
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-[#9CA3AF]">Show only issues</Label>
                <Switch
                  checked={filters.health?.length === 2 && filters.health.includes("poor") && filters.health.includes("broken")}
                  onCheckedChange={(v) => {
                    if (v) onFilterChange({ ...filters, health: ["poor", "broken"] });
                    else onFilterChange({ ...filters, health: undefined });
                  }}
                />
              </div>
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

// ── Podcast Card (Grid) ──

function PodcastCard({
  podcast,
  selected,
  onClick,
  onToggleStatus,
  togglingId,
}: {
  podcast: AdminPodcast;
  selected: boolean;
  onClick: () => void;
  onToggleStatus: (id: string, currentStatus: PodcastStatus) => void;
  togglingId: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg bg-[#1A2942] border p-3 transition-all hover:border-white/10 group",
        selected ? "border-[#3B82F6]/40 bg-[#3B82F6]/5" : "border-white/5"
      )}
    >
      <div className="flex items-start gap-3">
        {podcast.imageUrl ? (
          <img src={podcast.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Rss className="h-5 w-5 text-[#9CA3AF]/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className="text-xs font-medium truncate">{podcast.title}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <HealthBadge health={podcast.feedHealth} />
              <Switch
                checked={podcast.status === "active"}
                disabled={podcast.status === "archived" || togglingId === podcast.id}
                onCheckedChange={() => onToggleStatus(podcast.id, podcast.status)}
                onClick={(e) => e.stopPropagation()}
                aria-label={podcast.status === "active" ? "Pause podcast" : "Activate podcast"}
                className="scale-75 data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
              />
            </div>
          </div>
          {podcast.author && (
            <span className="text-[10px] text-[#9CA3AF] block truncate mt-0.5">{podcast.author}</span>
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#9CA3AF]">
            <span className="font-mono tabular-nums">{podcast.episodeCount} eps</span>
            <span className="font-mono tabular-nums">{podcast.subscriberCount} subs</span>
            <span>{relativeTime(podcast.lastFetchedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Podcast Row (List) ──

function PodcastRow({
  podcast,
  selected,
  onClick,
  onToggleStatus,
  togglingId,
}: {
  podcast: AdminPodcast;
  selected: boolean;
  onClick: () => void;
  onToggleStatus: (id: string, currentStatus: PodcastStatus) => void;
  togglingId: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center h-12 px-3 gap-3 transition-colors border-b border-white/5 text-xs",
        selected ? "bg-[#3B82F6]/5" : "hover:bg-white/[0.03] even:bg-[#1A2942]"
      )}
    >
      {podcast.imageUrl ? (
        <img src={podcast.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
      ) : (
        <div className="h-7 w-7 rounded bg-white/5 flex items-center justify-center shrink-0">
          <Rss className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
        </div>
      )}
      <span className="flex-1 min-w-0 truncate font-medium">{podcast.title}</span>
      <span className="w-24 text-[#9CA3AF] truncate hidden lg:block">{podcast.author ?? "-"}</span>
      <span className="w-14 text-right font-mono tabular-nums text-[#9CA3AF]">{podcast.episodeCount}</span>
      <span className="w-12 text-right font-mono tabular-nums text-[#9CA3AF]">{podcast.subscriberCount}</span>
      <span className="w-20 text-center"><HealthBadge health={podcast.feedHealth} /></span>
      <span className="w-16 text-center"><StatusBadge status={podcast.status} /></span>
      <span className="w-16 text-right text-[10px] text-[#9CA3AF]">{relativeTime(podcast.lastFetchedAt)}</span>
      <span className="w-10 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={podcast.status === "active"}
          disabled={podcast.status === "archived" || togglingId === podcast.id}
          onCheckedChange={() => onToggleStatus(podcast.id, podcast.status)}
          aria-label={podcast.status === "active" ? "Pause podcast" : "Activate podcast"}
          className="scale-75 data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
        />
      </span>
    </button>
  );
}

// ── Details Panel ──

function DetailsPanel({
  podcastId,
  onClose,
}: {
  podcastId: string | null;
  onClose: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [detail, setDetail] = useState<AdminPodcastDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!podcastId) return;
    setLoading(true);
    apiFetch<{ data: AdminPodcastDetail }>(`/podcasts/${podcastId}`)
      .then((r) => setDetail(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [podcastId, apiFetch]);

  if (!podcastId) return null;

  return (
    <div className="w-[360px] shrink-0 rounded-lg bg-[#1A2942] border border-white/5 flex flex-col overflow-hidden">
      {loading || !detail ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-16 rounded-lg bg-white/5" />
          <Skeleton className="h-4 w-3/4 bg-white/5" />
          <Skeleton className="h-3 w-1/2 bg-white/5" />
          <Skeleton className="h-24 bg-white/5 rounded" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 border-b border-white/5">
            <div className="flex items-start gap-3">
              {detail.imageUrl ? (
                <img src={detail.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <Rss className="h-6 w-6 text-[#9CA3AF]/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">{detail.title}</h3>
                {detail.author && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{detail.author}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <HealthBadge health={detail.feedHealth} />
                  <StatusBadge status={detail.status} />
                </div>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={onClose} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* RSS URL */}
            <div className="mt-3 flex items-center gap-1.5 rounded-md bg-white/[0.03] p-2">
              <Rss className="h-3 w-3 text-[#9CA3AF] shrink-0" />
              <span className="text-[10px] text-[#9CA3AF] font-mono truncate flex-1">{detail.feedUrl}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                onClick={() => navigator.clipboard.writeText(detail.feedUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-px bg-white/5">
            {[
              { label: "Episodes", value: detail.episodeCount },
              { label: "Subscribers", value: detail.subscriberCount },
              { label: "Last Fetch", value: relativeTime(detail.lastFetchedAt) },
            ].map((s) => (
              <div key={s.label} className="bg-[#1A2942] p-2 text-center">
                <div className="text-[10px] text-[#9CA3AF]">{s.label}</div>
                <div className="text-xs font-semibold font-mono tabular-nums mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
            <TabsList variant="line" className="px-4 border-b border-white/5 bg-transparent">
              <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
              <TabsTrigger value="episodes" className="text-[11px]">Episodes</TabsTrigger>
              <TabsTrigger value="activity" className="text-[11px]">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex-1 overflow-auto p-4">
              <div className="space-y-3">
                {detail.description && (
                  <p className="text-[11px] text-[#9CA3AF] leading-relaxed line-clamp-4">{detail.description}</p>
                )}
                {detail.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {detail.categories.map((c) => (
                      <Badge key={c} className="bg-white/5 text-[#9CA3AF] text-[10px]">{c}</Badge>
                    ))}
                  </div>
                )}
                {detail.feedError && (
                  <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3 w-3 text-[#EF4444]" />
                      <span className="text-[10px] font-semibold text-[#EF4444]">Feed Error</span>
                    </div>
                    <p className="text-[10px] text-[#EF4444]/80">{detail.feedError}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="episodes" className="flex-1 overflow-auto">
              <div className="divide-y divide-white/5">
                {detail.episodes.map((ep) => (
                  <div key={ep.id} className="flex items-center gap-2 px-4 py-2 text-[11px] hover:bg-white/[0.03]">
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{ep.title}</span>
                      <span className="text-[10px] text-[#9CA3AF]">{relativeTime(ep.publishedAt)}</span>
                    </div>
                    <Badge className={cn(
                      "text-[9px]",
                      ep.pipelineStatus === "completed" ? "bg-[#10B981]/15 text-[#10B981]" :
                      ep.pipelineStatus === "failed" ? "bg-[#EF4444]/15 text-[#EF4444]" :
                      "bg-[#F59E0B]/15 text-[#F59E0B]"
                    )}>
                      {ep.pipelineStatus}
                    </Badge>
                  </div>
                ))}
                {detail.episodes.length === 0 && (
                  <div className="flex flex-col items-center py-8 text-[#9CA3AF]">
                    <Clock className="h-5 w-5 mb-1.5 opacity-40" />
                    <span className="text-[10px]">No episodes</span>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="flex-1 overflow-auto p-4">
              <div className="space-y-2">
                {detail.recentPipelineActivity.map((evt) => (
                  <div key={evt.id} className="flex items-center gap-2 text-[10px]">
                    <span className="text-[#9CA3AF] font-mono w-12 shrink-0">{relativeTime(evt.timestamp)}</span>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      evt.status === "completed" ? "bg-[#10B981]" : evt.status === "failed" ? "bg-[#EF4444]" : "bg-[#F59E0B]"
                    )} />
                    <span className="text-[#F9FAFB]/80 truncate flex-1">{evt.stageName}</span>
                  </div>
                ))}
                {detail.recentPipelineActivity.length === 0 && (
                  <div className="flex flex-col items-center py-8 text-[#9CA3AF]">
                    <Activity className="h-5 w-5 mb-1.5 opacity-40" />
                    <span className="text-[10px]">No recent activity</span>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Quick Actions */}
          <div className="p-3 border-t border-white/5 flex gap-2">
            <Button
              size="xs"
              className="flex-1 bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-[10px]"
              disabled={refreshing}
              onClick={async () => {
                if (!podcastId) return;
                setRefreshing(true);
                try {
                  await apiFetch(`/podcasts/${podcastId}/refresh`, { method: "POST" });
                  // Reload detail
                  const r = await apiFetch<{ data: AdminPodcastDetail }>(`/podcasts/${podcastId}`);
                  setDetail(r.data);
                } catch (e) {
                  console.error("Failed to refresh podcast:", e);
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button size="xs" variant="ghost" className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]">
              <Pause className="h-3 w-3" />
            </Button>
            <Button size="xs" variant="ghost" className="text-[#9CA3AF] hover:text-[#F9FAFB] text-[10px]">
              <Archive className="h-3 w-3" />
            </Button>
            <Button size="xs" variant="ghost" className="text-[#EF4444] hover:text-[#EF4444]/80 text-[10px]">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add Podcast Dialog ──

function AddPodcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apiFetch = useAdminFetch();
  const [url, setUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    description: string;
    imageUrl?: string;
    episodeCount: number;
    costEstimate: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = () => {
    setValidating(true);
    setError(null);
    setPreview(null);
    // Skip server-side validation since the endpoint doesn't exist.
    // Show a basic preview from the URL; the feed will be validated on import.
    setTimeout(() => {
      setPreview({
        title: url.split('/').pop() ?? 'New Podcast',
        description: 'Feed URL will be validated on import',
        episodeCount: 0,
        costEstimate: 'TBD',
      });
      setValidating(false);
    }, 300);
  };

  const handleImport = () => {
    setImporting(true);
    apiFetch("/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl: url, title: preview?.title ?? url }),
    })
      .then(() => { onClose(); })
      .catch((e) => setError(e.message))
      .finally(() => setImporting(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0F1D32] border-white/10 text-[#F9FAFB] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB]">Add Podcast</DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Enter an RSS feed URL to import a new podcast.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://feeds.example.com/podcast.xml"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(null); setError(null); }}
              className="flex-1 bg-white/5 border-white/10 text-[#F9FAFB] text-xs placeholder:text-[#9CA3AF]/50"
            />
            <Button
              size="sm"
              onClick={handleValidate}
              disabled={!url || validating}
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
            >
              {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Validate"}
            </Button>
          </div>

          {error && (
            <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-2 text-[11px] text-[#EF4444]">
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-3 space-y-3">
              <div className="flex items-start gap-3">
                {preview.imageUrl ? (
                  <img src={preview.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <Rss className="h-5 w-5 text-[#9CA3AF]/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{preview.title}</div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 line-clamp-2">{preview.description}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#9CA3AF]">
                <span>{preview.episodeCount} episodes</span>
                <span>Est. cost: {preview.costEstimate}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview || importing}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import Podcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading ──

function CatalogSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <Skeleton className="w-[280px] h-full bg-white/5 rounded-lg shrink-0" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──

export default function Catalog() {
  const apiFetch = useAdminFetch();

  const [podcasts, setPodcasts] = useState<AdminPodcast[]>([]);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState("title");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalResults, setTotalResults] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const totalPages = Math.ceil(totalResults / pageSize);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.health?.length) params.set("health", filters.health.join(","));
    if (filters.status?.length) params.set("status", filters.status.join(","));
    if (filters.activity) params.set("activity", filters.activity);
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    Promise.all([
      apiFetch<PaginatedResponse<AdminPodcast>>(`/podcasts?${params}`)
        .then((r) => { setPodcasts(r.data); setTotalResults(r.total); })
        .catch(console.error),
      apiFetch<{ data: CatalogStats }>("/podcasts/stats").then((r) => setStats(r.data)).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [apiFetch, filters, sort, page, pageSize]);

  const handleToggleStatus = useCallback(
    async (id: string, currentStatus: PodcastStatus) => {
      if (currentStatus === "archived") return;
      const newStatus = currentStatus === "active" ? "paused" : "active";
      setTogglingId(id);
      try {
        await apiFetch(`/podcasts/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        load();
      } catch (e) {
        console.error("Failed to toggle podcast status:", e);
      } finally {
        setTogglingId(null);
      }
    },
    [apiFetch, load],
  );

  useEffect(() => { load(); }, [load]);

  if (loading && podcasts.length === 0) return <CatalogSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Filter Sidebar */}
      <FilterSidebar
        filters={filters}
        stats={stats}
        onFilterChange={(f) => { setFilters(f); setPage(1); }}
        collapsed={filterCollapsed}
        onToggle={() => setFilterCollapsed(!filterCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setView("grid")}
              className={cn(view === "grid" ? "text-[#F9FAFB] bg-white/5" : "text-[#9CA3AF]")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setView("list")}
              className={cn(view === "list" ? "text-[#F9FAFB] bg-white/5" : "text-[#9CA3AF]")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Separator orientation="vertical" className="h-4 bg-white/10" />
            <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-7 text-[10px] bg-white/5 border-white/10 text-[#9CA3AF]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                <SelectItem value="title" className="text-xs">Title</SelectItem>
                <SelectItem value="episodes" className="text-xs">Episodes</SelectItem>
                <SelectItem value="subscribers" className="text-xs">Subscribers</SelectItem>
                <SelectItem value="health" className="text-xs">Health</SelectItem>
                <SelectItem value="lastFetched" className="text-xs">Last Fetched</SelectItem>
              </SelectContent>
            </Select>
            <Separator orientation="vertical" className="h-4 bg-white/10" />
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-20 h-7 text-[10px] bg-white/5 border-white/10 text-[#9CA3AF]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                <SelectItem value="25" className="text-xs">25</SelectItem>
                <SelectItem value="50" className="text-xs">50</SelectItem>
                <SelectItem value="100" className="text-xs">100</SelectItem>
                <SelectItem value="200" className="text-xs">200</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[10px] text-[#9CA3AF] font-mono">{totalResults} total</span>
          </div>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Podcast
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {view === "grid" ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
              {podcasts.map((p) => (
                <PodcastCard
                  key={p.id}
                  podcast={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  onToggleStatus={handleToggleStatus}
                  togglingId={togglingId}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-[#1A2942] border border-white/5 overflow-hidden">
              {/* Table header */}
              <div className="flex items-center h-8 px-3 gap-3 border-b border-white/5 bg-white/[0.02] text-[10px] text-[#9CA3AF] uppercase tracking-wider font-medium">
                <span className="w-7" />
                <span className="flex-1">Title</span>
                <span className="w-24 hidden lg:block">Author</span>
                <span className="w-14 text-right">Eps</span>
                <span className="w-12 text-right">Subs</span>
                <span className="w-20 text-center">Health</span>
                <span className="w-16 text-center">Status</span>
                <span className="w-16 text-right">Fetched</span>
                <span className="w-10 text-center">On</span>
              </div>
              {podcasts.map((p) => (
                <PodcastRow
                  key={p.id}
                  podcast={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  onToggleStatus={handleToggleStatus}
                  togglingId={togglingId}
                />
              ))}
            </div>
          )}

          {podcasts.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
              <Library className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm">No podcasts found</span>
              <span className="text-xs mt-1">Try adjusting your filters</span>
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
            <span className="text-[10px] text-[#9CA3AF] font-mono">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalResults)} of {totalResults}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-[#9CA3AF] font-mono px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Details Panel */}
      {selectedId && (
        <DetailsPanel podcastId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Add Dialog */}
      <AddPodcastDialog open={addOpen} onClose={() => { setAddOpen(false); load(); }} />
    </div>
  );
}
