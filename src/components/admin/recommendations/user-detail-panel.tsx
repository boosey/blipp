import { RefreshCw, Loader2, Brain, Sparkles, Database, Podcast } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AdminRecommendationUserDetail } from "@/types/admin";
import { relativeTime, initials, initialsColor, categoryColor } from "./helpers";

export interface UserDetailPanelProps {
  detail: AdminRecommendationUserDetail | null;
  loading: boolean;
  onRecompute: () => void;
  recomputing: boolean;
}

// ── Category Profile Section ──

function CategoryProfileSection({
  profile,
}: {
  profile: AdminRecommendationUserDetail["profile"];
}) {
  if (!profile) {
    return (
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-8 flex flex-col items-center justify-center text-center">
        <Brain className="h-8 w-8 text-[#9CA3AF]/30 mb-3" />
        <p className="text-xs text-[#9CA3AF]">
          No recommendation profile yet — subscribe to podcasts to generate recommendations
        </p>
      </div>
    );
  }

  const sorted = Object.entries(profile.categoryWeights).sort(([, a], [, b]) => b - a);
  const maxWeight = sorted[0]?.[1] ?? 1;

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-[#8B5CF6]" />
        <span className="text-sm font-semibold text-[#F9FAFB]">Category Profile</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-[#9CA3AF]">
          <span className="font-mono tabular-nums">{profile.listenCount} listened</span>
          <span>computed {relativeTime(profile.computedAt)}</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[#9CA3AF]">No category weights computed yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([category, weight]) => {
            const pct = (weight / maxWeight) * 100;
            const displayPct = Math.round(weight * 100);
            return (
              <div key={category} className="flex items-center gap-3">
                <span className="text-[11px] text-[#9CA3AF] w-32 shrink-0 truncate">{category}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3B82F6] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-9 text-right shrink-0">
                  {displayPct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cached Recommendations Section ──

function CachedRecommendationsSection({
  cache,
}: {
  cache: AdminRecommendationUserDetail["cache"];
}) {
  if (!cache) {
    return (
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-6 flex flex-col items-center justify-center text-center">
        <Database className="h-6 w-6 text-[#9CA3AF]/30 mb-2" />
        <p className="text-xs text-[#9CA3AF]">No cached recommendations</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#F59E0B]" />
        <span className="text-sm font-semibold text-[#F9FAFB]">Cached Recommendations</span>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#9CA3AF]">
          <span>computed {relativeTime(cache.computedAt)}</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
            {cache.recommendations.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {cache.recommendations.slice(0, 10).map((rec, idx) => (
          <div
            key={rec.podcast.id}
            className="rounded-md bg-[#0A1628] border border-white/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF]/50 w-4 shrink-0">
                {idx + 1}
              </span>
              {rec.podcast.imageUrl ? (
                <img
                  src={rec.podcast.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                  <Podcast className="h-4 w-4 text-[#9CA3AF]/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[#F9FAFB] truncate">
                  {rec.podcast.title}
                </div>
                <div className="text-[10px] text-[#9CA3AF] truncate">{rec.podcast.author}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
                  {Math.round(rec.score * 100)}%
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="flex items-center gap-2 pl-7">
              <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B82F6]/70 transition-all"
                  style={{ width: `${rec.score * 100}%` }}
                />
              </div>
            </div>

            {/* Reason tags */}
            {rec.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-7">
                {rec.reasons.map((reason) => {
                  const col = categoryColor(reason);
                  return (
                    <span
                      key={reason}
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ backgroundColor: `${col}15`, color: col }}
                    >
                      {reason}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── User Detail Panel ──

export function UserDetailPanel({
  detail,
  loading,
  onRecompute,
  recomputing,
}: UserDetailPanelProps) {
  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-20 bg-white/5 rounded-lg" />
        <Skeleton className="h-8 bg-white/5 rounded-lg" />
        <Skeleton className="h-40 bg-white/5 rounded-lg" />
        <Skeleton className="h-60 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!detail) return null;

  const color = initialsColor(detail.id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 shrink-0">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            {detail.imageUrl && <AvatarImage src={detail.imageUrl} />}
            <AvatarFallback
              style={{ backgroundColor: `${color}20`, color }}
              className="text-base font-semibold"
            >
              {initials(detail.name, detail.email)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#F9FAFB] truncate">
              {detail.name || detail.email}
            </div>
            {detail.name && (
              <div className="text-xs text-[#9CA3AF] truncate">{detail.email}</div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF] mt-1">
              <span className="font-mono tabular-nums">
                {detail.subscriptionCount} subscription{detail.subscriptionCount !== 1 ? "s" : ""}
              </span>
              <span className="font-mono tabular-nums">
                {detail.favoriteCount} favorite{detail.favoriteCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <Button
            size="sm"
            disabled={recomputing}
            onClick={onRecompute}
            className="shrink-0 bg-[#8B5CF6]/15 text-[#8B5CF6] hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/20 text-xs"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {recomputing ? "Recomputing..." : "Recompute"}
          </Button>
        </div>
      </div>

      <CategoryProfileSection profile={detail.profile} />
      <CachedRecommendationsSection cache={detail.cache} />
    </div>
  );
}
