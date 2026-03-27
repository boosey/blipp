import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AdminUser } from "@/types/admin";
import {
  initials,
  initialsColor,
  statusDotClass,
  planBadgeClass,
  userBadgeConfig,
} from "./helpers";

export interface UserRowProps {
  user: AdminUser;
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
          {initials(user.name ?? undefined, user.email)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#F9FAFB] truncate font-medium">
            {user.name || user.email}
          </span>
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotClass(user.status))} />
          <Badge className={cn("text-[9px] uppercase shrink-0", planBadgeClass(user.plan.slug))}>
            {user.plan.name}
          </Badge>
        </div>

        {user.name && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{user.email}</div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
          <span className="font-mono tabular-nums">
            {user.briefingCount} briefing{user.briefingCount !== 1 ? "s" : ""}
          </span>
          <span className="font-mono tabular-nums">
            {user.podcastCount} podcast{user.podcastCount !== 1 ? "s" : ""}
          </span>
          {user.badges.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              {user.badges.slice(0, 2).map((b) => {
                const cfg = userBadgeConfig(b);
                return (
                  <Badge key={b} className={cn("text-[8px] uppercase px-1 py-0", cfg.class)}>
                    {cfg.label}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
