import { useState, useEffect, useCallback } from "react";
import {
  Flag,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminFetch } from "@/lib/api-client";
import type { FeatureFlag } from "@/types/admin";

function FeatureFlagsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-40 bg-white/5" />
      <Skeleton className="h-4 w-64 bg-white/5" />
      <Skeleton className="h-10 bg-white/5 rounded-lg" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function FeatureFlags() {
  const apiFetch = useAdminFetch();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: FeatureFlag[] }>("/config/features");
      setFlags(res.data);
    } catch (e) {
      console.error("Failed to load feature flags:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async (flag: FeatureFlag) => {
    setToggling(flag.id);
    try {
      await apiFetch(`/config/features/${flag.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      await load();
    } catch (e) {
      console.error("Failed to toggle feature flag:", e);
    } finally {
      setToggling(null);
    }
  }, [apiFetch, load]);

  if (loading && flags.length === 0) return <FeatureFlagsSkeleton />;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Feature Flags</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Control feature rollout and availability</p>
        </div>
        <Button size="sm" className="bg-[#F97316] hover:bg-[#F97316]/80 text-white text-xs gap-1.5">
          <Plus className="h-3 w-3" />
          Add Flag
        </Button>
      </div>

      <div className="space-y-1">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_100px_50px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF]">
          <span>Flag</span>
          <span>Status</span>
          <span>Rollout</span>
          <span className="text-right">Toggle</span>
        </div>

        <div className="space-y-1">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="grid grid-cols-[1fr_80px_100px_50px] gap-3 items-center bg-[#0F1D32] border border-white/5 rounded-lg px-3 py-3 hover:border-white/10 transition-colors"
            >
              {/* Name + description */}
              <div className="min-w-0">
                <span className="text-xs font-medium text-[#F9FAFB] block truncate">{flag.name}</span>
                {flag.description && (
                  <span className="text-[10px] text-[#9CA3AF] block truncate mt-0.5">{flag.description}</span>
                )}
              </div>

              {/* Status */}
              <div>
                <Badge
                  className={cn(
                    "text-[10px]",
                    flag.enabled
                      ? "bg-[#10B981]/15 text-[#10B981]"
                      : "bg-white/5 text-[#9CA3AF]"
                  )}
                >
                  {flag.enabled ? "ON" : "OFF"}
                </Badge>
              </div>

              {/* Rollout percentage */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${flag.rolloutPercentage}%`,
                      backgroundColor: flag.enabled ? "#F97316" : "#9CA3AF",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-8 text-right">
                  {flag.rolloutPercentage}%
                </span>
              </div>

              {/* Toggle */}
              <div className="flex justify-end">
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => handleToggle(flag)}
                  disabled={toggling === flag.id}
                  className="data-[state=checked]:bg-[#F97316]"
                />
              </div>
            </div>
          ))}
        </div>

        {flags.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
            <Flag className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No feature flags configured</span>
          </div>
        )}
      </div>
    </div>
  );
}
