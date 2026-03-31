import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { dateRangeFromDays, AnalyticsSkeleton } from "@/components/admin/analytics/shared";
import { CostBreakdownWidget } from "@/components/admin/analytics/cost-breakdown-widget";
import { UsageTrendsWidget } from "@/components/admin/analytics/usage-trends-widget";
import { QualityMetricsWidget } from "@/components/admin/analytics/quality-metrics-widget";
import { PipelinePerformanceWidget } from "@/components/admin/analytics/pipeline-performance-widget";
import { ModelCostWidget } from "@/components/admin/analytics/model-cost-widget";

export default function Analytics() {
  const apiFetch = useAdminFetch();

  const [rangeDays, setRangeDays] = useState(30);
  const [costs, setCosts] = useState<CostBreakdownData | null>(null);
  const [usage, setUsage] = useState<UsageTrendsData | null>(null);
  const [quality, setQuality] = useState<QualityMetricsData | null>(null);
  const [pipeline, setPipeline] = useState<PipelinePerformanceData | null>(null);
  const [modelCosts, setModelCosts] = useState<ModelCostData | null>(null);
  const [loading, setLoading] = useState(true);

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

  usePolling(load, 5 * 60 * 1000);

  if (loading && !costs && !usage && !quality && !pipeline) return <AnalyticsSkeleton />;

  return (
    <div className="h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
          {costs ? <CostBreakdownWidget data={costs} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}
          {usage ? <UsageTrendsWidget data={usage} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}
          {quality ? <QualityMetricsWidget data={quality} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}
          {pipeline ? <PipelinePerformanceWidget data={pipeline} /> : <Skeleton className="h-[420px] bg-white/5 rounded-lg" />}
        </div>

        {/* Full-width: Model Cost Breakdown */}
        {modelCosts ? <ModelCostWidget data={modelCosts} /> : <Skeleton className="h-[300px] bg-white/5 rounded-lg" />}
      </ScrollArea>
    </div>
  );
}
