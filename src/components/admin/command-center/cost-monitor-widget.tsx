import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostSummary } from "@/types/admin";
import { formatCurrency } from "./utils";

function MiniPie({ breakdown }: { breakdown: CostSummary["breakdown"] }) {
  const total = breakdown.reduce((s, b) => s + b.amount, 0);
  if (total === 0) return null;
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"];
  let cumulative = 0;

  function describeArc(startAngle: number, endAngle: number) {
    const start = polarToCartesian(20, 20, 18, endAngle);
    const end = polarToCartesian(20, 20, 18, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M 20 20 L ${start.x} ${start.y} A 18 18 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
  }

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      {breakdown.map((b, i) => {
        const angle = (b.amount / total) * 360;
        const startAngle = cumulative;
        cumulative += angle;
        if (angle < 0.5) return null;
        return (
          <path
            key={i}
            d={describeArc(startAngle, startAngle + angle)}
            fill={colors[i % colors.length]}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

function Sparkline({ data, width = 100, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export interface CostMonitorWidgetProps {
  cost: CostSummary | null;
}

export function CostMonitorWidget({ cost }: CostMonitorWidgetProps) {
  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center gap-2 mb-3 shrink-0">
        <DollarSign className="h-4 w-4 text-[#10B981]" />
        <span className="text-sm font-semibold">Cost Monitor</span>
      </div>
      {cost ? (
        <div className="flex-1 min-h-0 overflow-auto space-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Today&apos;s Spend</span>
            <div className="text-3xl font-bold font-mono tabular-nums mt-0.5">{formatCurrency(cost.todaySpend)}</div>
          </div>
          <Sparkline data={cost.breakdown.map((b) => b.amount)} />
          <div className="flex items-center gap-3">
            <MiniPie breakdown={cost.breakdown} />
            <div className="flex-1 space-y-1">
              {cost.breakdown.map((b, i) => (
                <div key={b.category} className="flex items-center gap-2 text-[10px]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"][i % 4] }} />
                  <span className="text-[#9CA3AF] flex-1">{b.category}</span>
                  <span className="text-[#F9FAFB] font-mono tabular-nums">{formatCurrency(b.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          <Separator className="bg-white/5" />
          <div className="flex items-center gap-1.5">
            {cost.trend >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-[#EF4444]" /> : <TrendingDown className="h-3.5 w-3.5 text-[#10B981]" />}
            <span className={cn("text-xs font-medium", cost.trend >= 0 ? "text-[#EF4444]" : "text-[#10B981]")}>
              {cost.trend >= 0 ? "+" : ""}{cost.trend.toFixed(0)}% vs yesterday
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-[#9CA3AF]">Budget</span>
              <span className="font-mono tabular-nums text-[#9CA3AF]">{cost.budgetUsed}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", cost.budgetUsed > 90 ? "bg-[#EF4444]" : cost.budgetUsed > 70 ? "bg-[#F59E0B]" : "bg-[#10B981]")}
                style={{ width: `${Math.min(cost.budgetUsed, 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-10 w-24 bg-white/5" />
          <Skeleton className="h-7 w-full bg-white/5" />
          <Skeleton className="h-16 w-full bg-white/5" />
        </div>
      )}
    </div>
  );
}
