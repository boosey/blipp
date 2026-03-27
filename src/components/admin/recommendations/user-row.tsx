import { CheckCircle2, Clock, Sparkles, Podcast } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AdminRecommendationUserRow } from "@/types/admin";
import { initials, initialsColor, cacheAgeLabel } from "./helpers";

export interface UserRowProps {
  user: AdminRecommendationUserRow;
  selected: boolean;
  onClick: () => void;
}

export function UserRow({ user, selected, onClick }: UserRowProps) {
  const color = initialsColor(user.id);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-all",
        selected
          ? "border-l-2 border-l-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30"
          : "bg-[#1A2942] border-white/5 hover:border-white/10"
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        {user.imageUrl && <AvatarImage src={user.imageUrl} />}
        <AvatarFallback
          style={{ backgroundColor: `${color}20`, color }}
          className="text-xs font-medium"
        >
          {initials(user.name, user.email)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#F9FAFB] truncate font-medium">
            {user.name || user.email}
          </span>
          {user.hasProfile ? (
            <CheckCircle2 className="h-3 w-3 text-[#10B981] shrink-0" />
          ) : (
            <span className="h-3 w-3 rounded-full border border-white/20 shrink-0" />
          )}
        </div>

        {user.name && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{user.email}</div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Clock className="h-2.5 w-2.5" />
            {cacheAgeLabel(user.cacheAge)}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Sparkles className="h-2.5 w-2.5" />
            <span className="font-mono tabular-nums">{user.cachedRecommendationCount}</span>
            {" recs"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Podcast className="h-2.5 w-2.5" />
            <span className="font-mono tabular-nums">{user.subscriptionCount}</span>
          </span>
        </div>
      </div>
    </button>
  );
}
