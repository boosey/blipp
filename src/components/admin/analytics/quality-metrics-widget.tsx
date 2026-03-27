import {
  Zap,
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
import { Badge } from "@/components/ui/badge";
import type { QualityMetricsData } from "@/types/admin";
import { ChartTooltip, CircularGauge, ProgressBar } from "./shared";

export interface QualityMetricsWidgetProps {
  data: QualityMetricsData;
}

export function QualityMetricsWidget({ data }: QualityMetricsWidgetProps) {
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
          {data.components.userSatisfaction != null && <ProgressBar label="User Satisfaction" value={data.components.userSatisfaction} color="#10B981" />}
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
