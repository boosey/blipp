import { Info, Library, Users, Disc3, Radio, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@/types/admin";
import { formatNumber } from "./utils";

function QuickStatCard({ label, value, trend, icon: Icon, color }: {
  label: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  color: string;
}) {
  const up = trend >= 0;
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <span className="text-xl font-bold tabular-nums font-mono">{formatNumber(value)}</span>
      <div className="flex items-center gap-1">
        {up ? <TrendingUp className="h-3 w-3 text-[#10B981]" /> : <TrendingDown className="h-3 w-3 text-[#EF4444]" />}
        <span className={cn("text-[10px] font-medium tabular-nums", up ? "text-[#10B981]" : "text-[#EF4444]")}>
          {up ? "+" : ""}{trend.toFixed(1)}%
        </span>
        <span className="text-[10px] text-[#9CA3AF]">vs yesterday</span>
      </div>
    </div>
  );
}

export interface QuickStatsWidgetProps {
  stats: DashboardStats | null;
}

export function QuickStatsWidget({ stats }: QuickStatsWidgetProps) {
  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
        <Info className="h-4 w-4 text-[#3B82F6]" />
        <span className="text-sm font-semibold">Quick Stats</span>
      </div>
      {stats ? (
        <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
          <QuickStatCard label="Podcasts" value={stats.podcasts.total} trend={stats.podcasts.trend} icon={Library} color="#3B82F6" />
          <QuickStatCard label="Users" value={stats.users.total} trend={stats.users.trend} icon={Users} color="#14B8A6" />
          <QuickStatCard label="Episodes" value={stats.episodes.total} trend={stats.episodes.trend} icon={Disc3} color="#8B5CF6" />
          <QuickStatCard label="Briefings" value={stats.briefings.total} trend={stats.briefings.trend} icon={Radio} color="#F59E0B" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
