import { Clock, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DurationTier } from "@/types/admin";
import { formatCost } from "./helpers";

export interface DurationTiersPanelProps {
  tiers: DurationTier[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}

export function DurationTiersPanel({
  tiers,
  loading,
  open,
  onToggle,
}: DurationTiersPanelProps) {
  return (
    <div className="rounded-lg bg-[#0F1D32] border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <Clock className="h-4 w-4 text-[#3B82F6]" />
        <span className="text-xs font-semibold text-[#F9FAFB]">Duration Tiers</span>
        <Badge className="bg-white/5 text-[#9CA3AF] border-white/10 text-[10px] ml-1">
          {loading ? "..." : tiers.length}
        </Badge>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#9CA3AF] ml-auto transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-[#9CA3AF]" />
            </div>
          ) : tiers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs">No duration tiers configured</span>
            </div>
          ) : (
            tiers.map((tier) => {
              const cacheColor =
                tier.cacheHitRate > 70 ? "#10B981" : tier.cacheHitRate > 40 ? "#F59E0B" : "#EF4444";
              return (
                <div
                  key={tier.minutes}
                  className="bg-[#0A1628] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-[#3B82F6]/10 shrink-0">
                      <span className="text-lg font-bold font-mono tabular-nums text-[#3B82F6]">
                        {tier.minutes}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#F9FAFB]">
                          {tier.minutes} minute{tier.minutes !== 1 ? "s" : ""}
                        </span>
                        <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
                          {tier.usageFrequency}% usage
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-[10px]">
                        <div>
                          <span className="text-[#9CA3AF]">Clips Generated</span>
                          <div className="text-xs font-mono tabular-nums text-[#F9FAFB] mt-0.5">
                            {tier.clipsGenerated.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-[#9CA3AF]">Storage Cost</span>
                          <div className="text-xs font-mono tabular-nums text-[#F9FAFB] mt-0.5">
                            {formatCost(tier.storageCost)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[#9CA3AF]">Cache Hit Rate</span>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${tier.cacheHitRate}%`, backgroundColor: cacheColor }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[10px]" style={{ color: cacheColor }}>
                              {tier.cacheHitRate.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
