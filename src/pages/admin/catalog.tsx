import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Library,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAdminFetch } from "@/lib/admin-api";
import { useFetch } from "@/lib/use-fetch";
import type {
  AdminPodcast,
  CatalogFilters,
  CatalogStats,
  PodcastStatus,
  PaginatedResponse,
} from "@/types/admin";

import { FilterSidebar } from "@/components/admin/catalog/filter-sidebar";
import { PodcastCard } from "@/components/admin/catalog/podcast-card";
import { PodcastRow } from "@/components/admin/catalog/podcast-row";
import { PodcastDetailModal } from "@/components/admin/catalog/podcast-detail-modal";
import { AddPodcastDialog } from "@/components/admin/catalog/add-podcast-dialog";
import { PodcastRequestsPanel } from "@/components/admin/catalog/podcast-requests-panel";
import { CatalogSkeleton } from "@/components/admin/catalog/catalog-skeleton";

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
  const [selectedPodcasts, setSelectedPodcasts] = useState<string[]>([]);
  const totalPages = Math.ceil(totalResults / pageSize);

  const { data: languageData } = useFetch<{ languages: string[] }>("/admin/podcasts/languages");
  const { data: categoryData } = useFetch<{ categories: { id: string; name: string; podcastCount: number }[] }>("/admin/podcasts/categories");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.health?.length) params.set("health", filters.health.join(","));
    if (filters.status?.length) params.set("status", filters.status.join(","));
    if (filters.activity) params.set("activity", filters.activity);
    if (filters.source) params.set("source", filters.source);
    if (filters.language) params.set("language", filters.language);
    if (filters.categories?.length) params.set("categories", filters.categories.join(","));
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

  const handleCheckToggle = useCallback((id: string) => {
    setSelectedPodcasts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  async function handleBulkStatus(status: "active" | "archived") {
    if (selectedPodcasts.length === 0) return;
    try {
      await apiFetch("/podcasts/bulk-status", {
        method: "POST",
        body: JSON.stringify({ podcastIds: selectedPodcasts, status }),
      });
      toast.success(`${selectedPodcasts.length} podcasts ${status === "active" ? "restored" : "archived"}`);
      setSelectedPodcasts([]);
      load();
    } catch {
      toast.error("Failed to update podcasts");
    }
  }

  useEffect(() => { load(); }, [load]);

  if (loading && podcasts.length === 0) return <CatalogSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      <FilterSidebar
        filters={filters}
        stats={stats}
        onFilterChange={(f) => { setFilters(f); setPage(1); }}
        collapsed={filterCollapsed}
        onToggle={() => setFilterCollapsed(!filterCollapsed)}
        languages={languageData?.languages ?? []}
        categories={categoryData?.categories ?? []}
      />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Podcast Requests */}
        <Accordion type="single" collapsible className="mb-3">
          <AccordionItem value="requests" className="border-white/10">
            <AccordionTrigger className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB] py-2">
              Podcast Requests
            </AccordionTrigger>
            <AccordionContent>
              <PodcastRequestsPanel onApproved={load} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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

            {stats && (stats.byStatus.pending_deletion ?? 0) > 0 && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, status: ["pending_deletion"] }))}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium"
              >
                {stats.byStatus.pending_deletion} pending deletion
              </button>
            )}

            {selectedPodcasts.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-4 bg-white/10" />
                <span className="text-[10px] text-[#3B82F6] font-medium">{selectedPodcasts.length} selected</span>
                <button
                  onClick={() => handleBulkStatus("active")}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded"
                >
                  Restore Selected
                </button>
                <button
                  onClick={() => handleBulkStatus("archived")}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded"
                >
                  Archive Selected
                </button>
                <button
                  onClick={() => setSelectedPodcasts([])}
                  className="text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB]"
                >
                  Clear
                </button>
              </>
            )}
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
                  isChecked={selectedPodcasts.includes(p.id)}
                  onCheckToggle={handleCheckToggle}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-[#1A2942] border border-white/5 overflow-hidden">
              <div className="flex items-center h-8 px-3 gap-3 border-b border-white/5 bg-white/[0.02] text-[10px] text-[#9CA3AF] uppercase tracking-wider font-medium">
                <span className="w-3.5" />
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
                  isChecked={selectedPodcasts.includes(p.id)}
                  onCheckToggle={handleCheckToggle}
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

      <PodcastDetailModal podcastId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />
      <AddPodcastDialog open={addOpen} onClose={() => { setAddOpen(false); load(); }} />
    </div>
  );
}
