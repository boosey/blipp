import {
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── Helpers ──

export function formatCost(n: number | undefined): string {
  if (n == null) return "-";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function dateRangeFromDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ── Custom Tooltip ──

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F1D32] border border-white/10 rounded-md p-2 text-xs shadow-lg">
      <div className="text-[#9CA3AF] text-[10px] mb-1">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-[#9CA3AF]">{entry.name}</span>
          <span className="ml-auto font-mono tabular-nums text-[#F9FAFB]">
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Circular Gauge ──

export interface CircularGaugeProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

export function CircularGauge({ value, size = 80, strokeWidth = 6, color = "#3B82F6", label }: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold font-mono tabular-nums" style={{ color }}>{value}</span>
        {label && <span className="text-[9px] text-[#9CA3AF]">{label}</span>}
      </div>
    </div>
  );
}

// ── Progress Bar ──

export interface ProgressBarProps {
  label: string;
  value: number;
  color: string;
}

export function ProgressBar({ label, value, color }: ProgressBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#9CA3AF]">{label}</span>
        <span className="font-mono tabular-nums" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Metric Card ──

export interface MetricItemProps {
  label: string;
  value: string;
  icon?: React.ElementType;
  color?: string;
}

export function MetricItem({ label, value, icon: Icon, color }: MetricItemProps) {
  return (
    <div className="rounded-md bg-[#0F1D32] border border-white/5 p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3 w-3" style={{ color: color ?? "#9CA3AF" }} />}
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-sm font-bold font-mono tabular-nums text-[#F9FAFB]">{value}</span>
    </div>
  );
}

// ── Loading Skeleton ──

export function AnalyticsSkeleton() {
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32 bg-white/5" />
        <Skeleton className="h-8 w-48 bg-white/5" />
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ── Plan colors for pie chart ──

export const PLAN_COLORS: Record<string, string> = {
  free: "#9CA3AF",
  pro: "#3B82F6",
  "pro-plus": "#8B5CF6",
};
