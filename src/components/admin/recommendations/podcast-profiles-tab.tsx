import { BarChart3, Podcast } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminPodcastProfile } from "@/types/admin";
import { relativeTime, categoryColor } from "./helpers";

export interface PodcastProfilesTabProps {
  profiles: AdminPodcastProfile[];
  loading: boolean;
  total: number;
}

export function PodcastProfilesTab({ profiles, loading, total }: PodcastProfilesTabProps) {
  if (loading && profiles.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <BarChart3 className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">No podcast profiles computed yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9CA3AF]">
          Showing {profiles.length} of{" "}
          <span className="font-mono tabular-nums text-[#F9FAFB]">{total}</span> profiles
        </span>
      </div>

      <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Podcast
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Categories
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-28">
                Popularity
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-28">
                Freshness
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Subs
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Computed
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr
                key={p.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {p.podcastImageUrl ? (
                      <img
                        src={p.podcastImageUrl}
                        alt=""
                        className="h-7 w-7 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                        <Podcast className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
                      </div>
                    )}
                    <span className="text-[11px] text-[#F9FAFB] truncate max-w-[140px]">
                      {p.podcastTitle}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {p.categories.slice(0, 3).map((cat) => {
                      const col = categoryColor(cat);
                      return (
                        <span
                          key={cat}
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: `${col}15`, color: col }}
                        >
                          {cat}
                        </span>
                      );
                    })}
                    {p.categories.length > 3 && (
                      <span className="text-[9px] text-[#9CA3AF]">+{p.categories.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3B82F6]/70"
                        style={{ width: `${Math.min(p.popularity * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-7 text-right shrink-0">
                      {Math.round(p.popularity * 100)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#10B981]/70"
                        style={{ width: `${Math.min(p.freshness * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-7 text-right shrink-0">
                      {Math.round(p.freshness * 100)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                  {p.subscriberCount}
                </td>
                <td className="px-3 py-2 text-right text-[10px] text-[#9CA3AF]">
                  {relativeTime(p.computedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
