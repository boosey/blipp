import { Mail, BarChart3, Podcast, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdminUserDetail } from "@/types/admin";
import { formatDate, relativeTime, planBadgeClass } from "./helpers";

export interface OverviewTabProps {
  user: AdminUserDetail;
}

export function OverviewTab({ user }: OverviewTabProps) {
  return (
    <div className="space-y-4">
      {/* Account Info */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#14B8A6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Account Info</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Email</span>
            <span className="text-[#F9FAFB] truncate ml-4">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Name</span>
            <span className="text-[#F9FAFB]">{user.name || "Not set"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Plan</span>
            <Badge className={cn("text-[9px] uppercase", planBadgeClass(user.plan.slug))}>
              {user.plan.name}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Signup Date</span>
            <span className="text-[#F9FAFB]">{formatDate(user.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Last Active</span>
            <span className="text-[#F9FAFB]">{relativeTime(user.lastActiveAt)}</span>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Usage Stats</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.briefingCount}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">Total Briefings</div>
          </div>
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.recentFeedItems?.filter(
                (fi) =>
                  new Date(fi.createdAt) >
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              ).length ?? 0}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">This Week</div>
          </div>
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.podcastCount}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">Podcasts</div>
          </div>
        </div>
      </div>

      {/* Top Podcasts */}
      {user.subscriptions.length > 0 && (
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Podcast className="h-4 w-4 text-[#8B5CF6]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Subscriptions</span>
            <Badge className="bg-white/5 text-[#9CA3AF] text-[9px] ml-auto">
              {user.subscriptions.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {user.subscriptions.slice(0, 8).map((sub) => (
              <div
                key={sub.podcastId}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[#0A1628] border border-white/5"
              >
                <span className="text-[#F9FAFB] truncate">{sub.podcastTitle}</span>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">
                  since {formatDate(sub.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Favorites */}
      {(user as any).favorites?.length > 0 && (
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-[#EF4444]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Favorites</span>
            <Badge className="bg-white/5 text-[#9CA3AF] text-[9px] ml-auto">
              {(user as any).favorites.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {(user as any).favorites.map((fav: any) => (
              <div
                key={fav.podcastId}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[#0A1628] border border-white/5"
              >
                {fav.podcastImageUrl ? (
                  <img src={fav.podcastImageUrl} alt="" className="w-6 h-6 rounded flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded bg-[#1A2942] flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] font-bold text-[#9CA3AF]">
                      {fav.podcastTitle?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-[#F9FAFB] truncate">{fav.podcastTitle}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
