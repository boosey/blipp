import { useNavigate } from "react-router-dom";
import { Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SystemHealth } from "@/types/admin";
import { STAGE_COLOR_MAP } from "./utils";

function HealthBar({ rate, color, label, onClick }: { rate: number; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-3 w-full text-left hover:bg-white/[0.03] -mx-1 px-1 py-1 rounded transition-colors">
      <span className="text-xs text-[#9CA3AF] w-24 truncate">{label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${rate}%`, backgroundColor: rate > 95 ? "#10B981" : rate > 80 ? "#F59E0B" : "#EF4444" }}
        />
      </div>
      <span className={cn(
        "text-xs font-mono w-10 text-right tabular-nums",
        rate > 95 ? "text-[#10B981]" : rate > 80 ? "text-[#F59E0B]" : "text-[#EF4444]"
      )}>
        {rate.toFixed(1)}%
      </span>
      <ChevronRight className="h-3 w-3 text-[#9CA3AF]/0 group-hover:text-[#9CA3AF]/60 transition-colors" />
    </button>
  );
}

export interface SystemHealthWidgetProps {
  health: SystemHealth | null;
}

export function SystemHealthWidget({ health }: SystemHealthWidgetProps) {
  const navigate = useNavigate();

  return (
    <div className="h-full rounded-lg bg-[#1A2942] border border-white/5 p-4 flex flex-col overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#3B82F6]" />
          <span className="text-sm font-semibold">System Health</span>
        </div>
        <Badge
          className={cn(
            "text-[10px] uppercase tracking-wider font-semibold",
            health?.overall === "operational"
              ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/20"
              : health?.overall === "degraded"
              ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/20"
              : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/20"
          )}
        >
          {health?.overall === "operational"
            ? "All Systems Operational"
            : health?.overall === "degraded"
            ? "Degraded Performance"
            : `${health?.activeIssuesCount ?? 0} Issues`}
        </Badge>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1">
        {health?.stages.map((s) => (
          <HealthBar
            key={s.stage}
            rate={s.completionRate}
            color={STAGE_COLOR_MAP[s.stage] ?? "#9CA3AF"}
            label={s.name}
            onClick={() => navigate(`/admin/pipeline?stage=${s.stage}`)}
          />
        ))}
        {!health && Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 bg-white/5 rounded" />
        ))}
      </div>
    </div>
  );
}
