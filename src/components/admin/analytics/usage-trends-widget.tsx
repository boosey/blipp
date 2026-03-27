import {
  Activity,
  Users,
  Clock,
  Maximize2,
  Disc3,
  Radio,
} from "lucide-react";
import {
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
import type { UsageTrendsData } from "@/types/admin";
import {
  formatNumber,
  formatDuration,
  ChartTooltip,
  MetricItem,
  PLAN_COLORS,
} from "./shared";

export interface UsageTrendsWidgetProps {
  data: UsageTrendsData;
}

export function UsageTrendsWidget({ data }: UsageTrendsWidgetProps) {
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
