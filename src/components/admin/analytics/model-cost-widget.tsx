import { Cpu } from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import type { ModelCostData } from "@/types/admin";
import { formatCost, formatNumber, ChartTooltip } from "./shared";

export interface ModelCostWidgetProps {
  data: ModelCostData;
}

export function ModelCostWidget({ data }: ModelCostWidgetProps) {
  const chartData = [...data.models]
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((m) => ({
      ...m,
      shortName: m.model.split(/[-/]/).slice(0, 3).join("-"),
    }));

  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[#14B8A6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Cost by Model</span>
        </div>
      </div>

      {/* Horizontal bar chart */}
      <div style={{ minHeight: Math.max(120, chartData.length * 36) }} className="mb-4">
        <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={false}
              width={120}
              tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "..." : v}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="totalCost" fill="#14B8A6" radius={[0, 4, 4, 0]} name="Cost" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By Stage breakdown */}
      <div className="pt-3 border-t border-white/5">
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">By Stage</span>
        <div className="space-y-2">
          {data.byStage.map((s) => (
            <div key={s.stage} className="flex items-center justify-between text-xs">
              <span className="text-[#F9FAFB]">{s.stageName}</span>
              <div className="flex items-center gap-3 text-[#9CA3AF]">
                <span className="font-mono tabular-nums">{formatNumber(s.callCount)} calls</span>
                <span className="font-mono tabular-nums">{formatNumber(s.totalInputTokens)} in</span>
                <span className="font-mono tabular-nums text-[#14B8A6]">{formatCost(s.totalCost)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
