import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Disc3,
  Maximize2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { CostBreakdownData } from "@/types/admin";
import { formatCost, ChartTooltip, MetricItem } from "./shared";

export interface CostBreakdownWidgetProps {
  data: CostBreakdownData;
}

export function CostBreakdownWidget({ data }: CostBreakdownWidgetProps) {
  const isUp = data.comparison.direction === "up";

  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-[#10B981]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Cost Breakdown</span>
        </div>
        <Maximize2 className="h-3.5 w-3.5 text-[#9CA3AF] cursor-pointer hover:text-[#F9FAFB] transition-colors" />
      </div>

      {/* Total cost */}
      <div className="mb-1">
        <span className="text-3xl font-bold font-mono tabular-nums text-[#F9FAFB]">
          {formatCost(data.totalCost)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-4">
        {isUp ? (
          <TrendingUp className="h-3.5 w-3.5 text-[#EF4444]" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-[#10B981]" />
        )}
        <span className={cn("text-xs font-medium", isUp ? "text-[#EF4444]" : "text-[#10B981]")}>
          {isUp ? "\u2191" : "\u2193"}{data.comparison.percentage.toFixed(1)}% vs previous period
        </span>
      </div>

      {/* Stacked Area Chart */}
      <div className="flex-1 min-h-0 mb-4" style={{ minHeight: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.dailyCosts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="infrastructure" stackId="1" fill="#10B981" fillOpacity={0.3} stroke="#10B981" strokeWidth={1.5} name="Infrastructure" />
            <Area type="monotone" dataKey="tts" stackId="1" fill="#F59E0B" fillOpacity={0.3} stroke="#F59E0B" strokeWidth={1.5} name="TTS" />
            <Area type="monotone" dataKey="distillation" stackId="1" fill="#8B5CF6" fillOpacity={0.3} stroke="#8B5CF6" strokeWidth={1.5} name="Distillation" />
            <Area type="monotone" dataKey="stt" stackId="1" fill="#3B82F6" fillOpacity={0.3} stroke="#3B82F6" strokeWidth={1.5} name="STT" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-2">
        <MetricItem label="Cost/Episode" value={formatCost(data.metrics.perEpisode)} icon={Disc3} color="#3B82F6" />
        <MetricItem label="Daily Avg" value={formatCost(data.metrics.dailyAvg)} icon={BarChart3} color="#8B5CF6" />
        <MetricItem label="Projected" value={formatCost(data.metrics.projectedMonthly)} icon={TrendingUp} color="#F59E0B" />
      </div>
    </div>
  );
}
