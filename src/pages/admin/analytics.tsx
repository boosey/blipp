import { useState, useEffect, useCallback, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Users,
  Clock,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  Zap,
  Disc3,
  Radio,
  Cpu,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  CostBreakdownData,
  UsageTrendsData,
  QualityMetricsData,
  PipelinePerformanceData,
  ModelCostData,
} from "@/types/admin";

// ── Helpers ──

function formatCost(n: number | undefined): string {
  if (n == null) return "-";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function dateRangeFromDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ── Custom Tooltip ──

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
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

function CircularGauge({ value, size = 80, strokeWidth = 6, color = "#3B82F6", label }: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
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

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
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

function MetricItem({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon?: React.ElementType;
  color?: string;
}) {
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

function AnalyticsSkeleton() {
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

const PLAN_COLORS: Record<string, string> = {
  free: "#9CA3AF",
  pro: "#3B82F6",
  "pro-plus": "#8B5CF6",
};

// ── Widget Components ──

function CostBreakdownWidget({ data }: { data: CostBreakdownData }) {
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
      <div className="grid grid-cols-4 gap-2 mb-3">
        <MetricItem label="Cost/Episode" value={formatCost(data.metrics.perEpisode)} icon={Disc3} color="#3B82F6" />
        <MetricItem label="Daily Avg" value={formatCost(data.metrics.dailyAvg)} icon={BarChart3} color="#8B5CF6" />
        <MetricItem label="Projected" value={formatCost(data.metrics.projectedMonthly)} icon={TrendingUp} color="#F59E0B" />
        <MetricItem label="Budget" value={data.metrics.budgetStatus} icon={DollarSign} color="#10B981" />
      </div>

      {/* Efficiency gauge */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
        <CircularGauge value={data.efficiencyScore} size={52} strokeWidth={4} color={data.efficiencyScore > 80 ? "#10B981" : data.efficiencyScore > 60 ? "#F59E0B" : "#EF4444"} />
        <div>
          <span className="text-xs font-medium text-[#F9FAFB]">Efficiency Score</span>
          <p className="text-[10px] text-[#9CA3AF]">Based on cost per output quality</p>
        </div>
      </div>
    </div>
  );
}

function UsageTrendsWidget({ data }: { data: UsageTrendsData }) {
  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#3B82F6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Usage Trends</span>
        </div>
        <Maximize2 className="h-3.5 w-3.5 text-[#9CA3AF] cursor-pointer hover:text-[#F9FAFB] transition-colors" />
      </div>

      {/* Key metrics 2x2 */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetricItem label="Feed Items" value={formatNumber(data.metrics.feedItems)} icon={Radio} color="#F59E0B" />
        <MetricItem label="Episodes" value={formatNumber(data.metrics.episodes)} icon={Disc3} color="#8B5CF6" />
        <MetricItem label="Active Users" value={formatNumber(data.metrics.users)} icon={Users} color="#14B8A6" />
        <MetricItem label="Avg Duration" value={formatDuration(data.metrics.avgDuration)} icon={Clock} color="#3B82F6" />
      </div>

      {/* Line chart */}
      <div className="flex-1 min-h-0 mb-4" style={{ minHeight: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trends} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="feedItems" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="Feed Items" />
            <Line type="monotone" dataKey="episodes" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name="Episodes" />
            <Line type="monotone" dataKey="users" stroke="#14B8A6" strokeWidth={1.5} dot={false} name="Users" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: pie chart + peak times */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
        {/* Usage by plan */}
        <div>
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">By Plan</span>
          <div className="flex items-center gap-3">
            <div style={{ width: 64, height: 64 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byPlan}
                    dataKey="count"
                    nameKey="plan"
                    cx="50%"
                    cy="50%"
                    innerRadius={18}
                    outerRadius={28}
                    strokeWidth={0}
                  >
                    {data.byPlan.map((entry, i) => (
                      <Cell key={i} fill={PLAN_COLORS[entry.plan] ?? "#9CA3AF"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1">
              {data.byPlan.map((t) => (
                <div key={t.plan} className="flex items-center gap-1.5 text-[10px]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PLAN_COLORS[t.plan] ?? "#9CA3AF" }} />
                  <span className="text-[#9CA3AF]">{t.plan}</span>
                  <span className="font-mono tabular-nums text-[#F9FAFB]">{t.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Peak times */}
        <div>
          <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">Peak Hours</span>
          <div style={{ height: 48 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.peakTimes} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Bar dataKey="count" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                <Tooltip content={<ChartTooltip />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityMetricsWidget({ data }: { data: QualityMetricsData }) {
  const scoreColor = data.overallScore > 80 ? "#10B981" : data.overallScore > 60 ? "#F59E0B" : "#EF4444";

  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Quality Metrics</span>
        </div>
        <Maximize2 className="h-3.5 w-3.5 text-[#9CA3AF] cursor-pointer hover:text-[#F9FAFB] transition-colors" />
      </div>

      {/* Overall score gauge */}
      <div className="flex items-center gap-4 mb-4">
        <CircularGauge value={data.overallScore} size={88} strokeWidth={6} color={scoreColor} label="Overall" />
        <div className="flex-1 space-y-2">
          <ProgressBar label="Time-Fitting" value={data.components.timeFitting} color="#3B82F6" />
          <ProgressBar label="Claim Coverage" value={data.components.claimCoverage} color="#8B5CF6" />
          <ProgressBar label="Transcription" value={data.components.transcription} color="#F59E0B" />
          <ProgressBar label="User Satisfaction" value={data.components.userSatisfaction} color="#10B981" />
        </div>
      </div>

      {/* Quality trend */}
      <div className="flex-1 min-h-0 mb-4" style={{ minHeight: 80 }}>
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1 block">Quality Trend</span>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="score" stroke={scoreColor} strokeWidth={2} dot={false} name="Score" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent issues */}
      <div className="pt-2 border-t border-white/5">
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">Recent Issues</span>
        <div className="space-y-1.5">
          {data.recentIssues.length === 0 ? (
            <span className="text-[10px] text-[#9CA3AF]">No recent issues</span>
          ) : (
            data.recentIssues.map((issue, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-[#F59E0B]" />
                  <span className="text-[#F9FAFB]">{issue.type}</span>
                </div>
                <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] text-[10px]">{issue.count}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PipelinePerformanceWidget({ data }: { data: PipelinePerformanceData }) {
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

function ModelCostWidget({ data }: { data: ModelCostData }) {
  // Sort models by cost descending for chart
  const chartData = [...data.models]
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((m) => ({
      ...m,
      // Truncate to first 3 segments: "claude-sonnet-4"
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

// ── Main ──

export default function Analytics() {
  const apiFetch = useAdminFetch();

  const [rangeDays, setRangeDays] = useState(30);
  const [costs, setCosts] = useState<CostBreakdownData | null>(null);
  const [usage, setUsage] = useState<UsageTrendsData | null>(null);
  const [quality, setQuality] = useState<QualityMetricsData | null>(null);
  const [pipeline, setPipeline] = useState<PipelinePerformanceData | null>(null);
  const [modelCosts, setModelCosts] = useState<ModelCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    const { from, to } = dateRangeFromDays(rangeDays);
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    setLoading(true);
    Promise.all([
      apiFetch<{ data: CostBreakdownData }>(`/analytics/costs${qs}`).then((r) => setCosts(r.data)).catch(console.error),
      apiFetch<{ data: UsageTrendsData }>(`/analytics/usage${qs}`).then((r) => setUsage(r.data)).catch(console.error),
      apiFetch<{ data: QualityMetricsData }>(`/analytics/quality${qs}`).then((r) => setQuality(r.data)).catch(console.error),
      apiFetch<{ data: PipelinePerformanceData }>(`/analytics/pipeline${qs}`).then((r) => setPipeline(r.data)).catch(console.error),
      apiFetch<{ data: ModelCostData }>(`/analytics/costs/by-model${qs}`).then((r) => setModelCosts(r.data)).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [apiFetch, rangeDays]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(load, 5 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [load]);

  if (loading && !costs && !usage && !quality && !pipeline) return <AnalyticsSkeleton />;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-[#F9FAFB]">Analytics</span>
        <div className="flex items-center gap-3">
          {/* Date range pills */}
          <div className="flex items-center bg-[#1A2942] border border-white/5 rounded-lg p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setRangeDays(d)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  rangeDays === d
                    ? "bg-[#3B82F6] text-white"
                    : "text-[#9CA3AF] hover:text-[#F9FAFB]"
                )}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>

          {/* Auto-refresh indicator */}
          <div className="flex items-center gap-1.5 text-[10px] text-[#10B981] font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
            </span>
            Auto-refresh 5min
          </div>
        </div>
      </div>

      {/* 2x2 Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-2 gap-4 pb-2">
          {/* Top-left: Cost Breakdown */}
          {costs ? <CostBreakdownWidget data={costs} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}

          {/* Top-right: Usage Trends */}
          {usage ? <UsageTrendsWidget data={usage} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}

          {/* Bottom-left: Quality Metrics */}
          {quality ? <QualityMetricsWidget data={quality} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}

          {/* Bottom-right: Pipeline Performance */}
          {pipeline ? <PipelinePerformanceWidget data={pipeline} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}
        </div>

        {/* Full-width: Model Cost Breakdown */}
        {modelCosts ? <ModelCostWidget data={modelCosts} /> : <Skeleton className="h-[300px] bg-white/5 rounded-lg" />}
      </ScrollArea>
    </div>
  );
}
