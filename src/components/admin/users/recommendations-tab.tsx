import { useState, useEffect, useCallback } from "react";
import { Brain, Zap, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/api-client";
import type { AdminRecommendationUserDetail } from "@/types/admin";
import { relativeTime } from "./helpers";

export interface RecommendationsTabProps {
  userId: string;
}

export function RecommendationsTab({ userId }: RecommendationsTabProps) {
  const apiFetch = useAdminFetch();
  const [recData, setRecData] = useState<AdminRecommendationUserDetail | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const loadRec = useCallback(() => {
    setRecLoading(true);
    apiFetch<{ data: AdminRecommendationUserDetail }>(`/recommendations/users/${userId}`)
      .then((r) => setRecData(r.data))
      .catch(() => setRecData(null))
      .finally(() => setRecLoading(false));
  }, [userId, apiFetch]);

  useEffect(() => {
    loadRec();
  }, [loadRec]);

  const handleRecompute = useCallback(() => {
    setRecomputing(true);
    apiFetch(`/recommendations/users/${userId}/recompute`, { method: "POST" })
      .then(() => loadRec())
      .catch(console.error)
      .finally(() => setRecomputing(false));
  }, [apiFetch, userId, loadRec]);

  if (recLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 bg-white/5 rounded" />
        <Skeleton className="h-4 bg-white/5 rounded w-4/5" />
        <Skeleton className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  const sortedCategories = recData?.profile
    ? Object.entries(recData.profile.categoryWeights).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-4">
      {/* No profile state */}
      {recData && !recData.profile && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
          <span className="text-xs text-[#9CA3AF]">
            No recommendation profile yet — user needs subscriptions to generate a profile
          </span>
        </div>
      )}

      {/* Profile card */}
      {recData?.profile && (
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#8B5CF6]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Category Profile</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
            <span className="font-mono tabular-nums">
              {recData.profile.listenCount} listened episode{recData.profile.listenCount !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>computed {relativeTime(recData.profile.computedAt)}</span>
          </div>
          <div className="space-y-2">
            {sortedCategories.map(([cat, weight]) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="text-[#9CA3AF] w-32 shrink-0 truncate">{cat}</span>
                <div className="flex-1 rounded-full bg-[#3B82F6]/20 h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3B82F6]"
                    style={{ width: `${Math.round(weight * 100)}%` }}
                  />
                </div>
                <span className="text-[#9CA3AF] w-8 text-right shrink-0 font-mono tabular-nums">
                  {Math.round(weight * 100)}%
                </span>
              </div>
            ))}
            {sortedCategories.length === 0 && (
              <div className="text-[10px] text-[#9CA3AF]">No categories yet</div>
            )}
          </div>
        </div>
      )}

      {/* Cache card */}
      {recData?.cache && (
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#10B981]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Cached Recommendations</span>
            <span className="text-[10px] text-[#9CA3AF] ml-auto">
              {relativeTime(recData.cache.computedAt)}
            </span>
          </div>
          <div className="space-y-2">
            {recData.cache.recommendations.slice(0, 8).map((rec, i) => {
              const pod = rec.podcast;
              const scoreWidth = `${Math.round(rec.score * 100)}%`;
              return (
                <div
                  key={pod.id ?? i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#0A1628] border border-white/5"
                >
                  {pod.imageUrl ? (
                    <img
                      src={pod.imageUrl}
                      alt=""
                      className="w-8 h-8 rounded shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-[#9CA3AF]">
                        {pod.title?.charAt(0)?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-[#F9FAFB] truncate">{pod.title}</span>
                      <span className="text-[10px] text-[#9CA3AF] shrink-0 truncate">
                        {pod.author}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 rounded-full bg-[#10B981]/20 h-1 overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full bg-[#10B981]"
                          style={{ width: scoreWidth }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {rec.reasons.map((r) => (
                          <span
                            key={r}
                            className="text-[9px] px-1 py-0.5 rounded bg-[#8B5CF6]/10 text-[#8B5CF6]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {recData.cache.recommendations.length === 0 && (
              <div className="text-[10px] text-[#9CA3AF]">No cached recommendations</div>
            )}
          </div>
        </div>
      )}

      {/* Recompute button */}
      <Button
        size="sm"
        className="w-full bg-[#8B5CF6]/15 text-[#8B5CF6] hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/20"
        disabled={recomputing}
        onClick={handleRecompute}
      >
        {recomputing ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Recomputing...
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5" /> Recompute
          </>
        )}
      </Button>
    </div>
  );
}
