import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Maximize2,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { cn } from "@/lib/utils";
import type { PipelinePerformanceData } from "@/types/admin";
import { formatMs, ChartTooltip } from "./shared";

export interface PipelinePerformanceWidgetProps {
  data: PipelinePerformanceData;
}

export function PipelinePerformanceWidget({ data }: PipelinePerformanceWidgetProps) {
  const throughputUp = data.throughput.trend >= 0;

  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#8B5CF6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Pipeline Performance</span>
        </div>
        <Maximize2 className="h-3.5 w-3.5 text-[#9CA3AF] cursor-pointer hover:text-[#F9FAFB] transition-colors" />
      </div>

      {/* Throughput */}
      <div className="mb-4">
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">Throughput</span>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-bold font-mono tabular-nums text-[#F9FAFB]">
            {data.throughput.episodesPerHour}
          </span>
          <span className="text-xs text-[#9CA3AF]">episodes/hour</span>
          <div className="flex items-center gap-1 ml-auto">
            {throughputUp ? (
              <TrendingUp className="h-3 w-3 text-[#10B981]" />
            ) : (
              <TrendingDown className="h-3 w-3 text-[#EF4444]" />
            )}
            <span className={cn("text-[10px] font-mono tabular-nums", throughputUp ? "text-[#10B981]" : "text-[#EF4444]")}>
              {throughputUp ? "+" : ""}{data.throughput.trend.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Success rates by stage */}
      <div className="mb-4">
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">Success Rates by Stage</span>
        <div className="space-y-2">
          {data.successRates.map((sr) => {
            const barColor = sr.rate > 95 ? "#10B981" : sr.rate > 80 ? "#F59E0B" : "#EF4444";
            return (
              <div key={sr.stage} className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#9CA3AF]">{sr.name}</span>
                  <span className="font-mono tabular-nums" style={{ color: barColor }}>{sr.rate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${sr.rate}%`, backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Processing speed trend */}
      <div className="flex-1 min-h-0 mb-4" style={{ minHeight: 70 }}>
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1 block">Processing Speed</span>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.processingSpeed} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
              tickFormatter={(v: number) => formatMs(v)}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="avgMs" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name="Avg Time" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottleneck detection */}
      {data.bottlenecks.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">Bottlenecks</span>
          <div className="space-y-2">
            {data.bottlenecks.map((b, i) => (
              <div key={i} className="rounded-md border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 text-[#F59E0B]" />
                  <span className="text-[11px] font-medium text-[#F59E0B]">{b.stage}</span>
                </div>
                <p className="text-[10px] text-[#9CA3AF] leading-relaxed">{b.issue}</p>
                <p className="text-[10px] text-[#F9FAFB]/70 mt-1">{b.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
