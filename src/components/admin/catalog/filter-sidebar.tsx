import {
  Search,
  Filter,
  ChevronLeft,
  X,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CatalogFilters, CatalogStats, FeedHealth, PodcastStatus } from "@/types/admin";
import { HEALTH_CONFIG, STATUS_LABELS, SOURCE_CONFIG } from "./catalog-utils";

export interface FilterSidebarProps {
  filters: CatalogFilters;
  stats: CatalogStats | null;
  onFilterChange: (f: CatalogFilters) => void;
  collapsed: boolean;
  onToggle: () => void;
  languages: string[];
  categories: { id: string; name: string; podcastCount: number }[];
}

export function FilterSidebar({
  filters,
  stats,
  onFilterChange,
  collapsed,
  onToggle,
  languages,
  categories,
}: FilterSidebarProps) {
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
                  {(["active", "paused", "archived", "pending_deletion"] as PodcastStatus[]).map((s) => (
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

              {/* Source */}
              {stats && Object.keys(stats.bySource ?? {}).length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">Source</span>
                  <div className="mt-2 space-y-1">
                    {Object.entries(stats.bySource).map(([src, count]) => {
                      const cfg = SOURCE_CONFIG[src] ?? { color: "#6B7280", label: src };
                      const active = filters.source === src;
                      return (
                        <button
                          key={src}
                          onClick={() => onFilterChange({ ...filters, source: active ? undefined : src })}
                          className={cn(
                            "flex items-center gap-2 w-full text-left rounded px-1.5 py-1 text-[11px] transition-colors",
                            active ? "bg-white/5 text-[#F9FAFB]" : "text-[#9CA3AF] hover:bg-white/[0.03]"
                          )}
                        >
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                          <span className="flex-1">{cfg.label}</span>
                          <span className="ml-auto font-mono text-[10px]">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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

              <Separator className="bg-white/5" />

              {/* Language */}
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Language</label>
                <select
                  value={filters.language ?? ""}
                  onChange={(e) => onFilterChange({ ...filters, language: e.target.value || undefined })}
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200"
                >
                  <option value="">All Languages</option>
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <Separator className="bg-white/5" />

              {/* Categories */}
              {categories.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1 block">Categories</label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          const current = filters.categories ?? [];
                          const next = current.includes(cat.name)
                            ? current.filter((c) => c !== cat.name)
                            : [...current, cat.name];
                          onFilterChange({ ...filters, categories: next.length > 0 ? next : undefined });
                        }}
                        className={`px-2 py-1 rounded-full text-xs transition-colors ${
                          filters.categories?.includes(cat.name)
                            ? "bg-white text-zinc-950"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {cat.name} ({cat.podcastCount})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
