import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AdminUserDetail } from "@/types/admin";
import {
  initials,
  initialsColor,
  statusDotClass,
  statusBadgeClass,
  planBadgeClass,
  userBadgeConfig,
  formatDate,
} from "./helpers";

export interface UserDetailHeaderProps {
  user: AdminUserDetail;
}

export function UserDetailHeader({ user }: UserDetailHeaderProps) {
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 shrink-0">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 shrink-0">
          {user.imageUrl && <AvatarImage src={user.imageUrl} />}
          <AvatarFallback
            style={{
              backgroundColor: `${initialsColor(user.id)}20`,
              color: initialsColor(user.id),
            }}
            className="text-lg font-semibold"
          >
            {initials(user.name ?? undefined, user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-[#F9FAFB]">
              {user.name || user.email}
            </span>
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                statusDotClass(user.status)
              )}
            />
            <Badge
              className={cn("text-[9px] uppercase", planBadgeClass(user.plan.slug))}
            >
              {user.plan.name}
            </Badge>
            <Badge
              className={cn("text-[9px] uppercase", statusBadgeClass(user.status))}
            >
              {user.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#9CA3AF] mt-1">
            {user.name && <span>{user.email}</span>}
            <span>Joined {formatDate(user.createdAt)}</span>
          </div>
          {user.badges.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {user.badges.map((b) => {
                const cfg = userBadgeConfig(b);
                return (
                  <Badge
                    key={b}
                    className={cn("text-[8px] uppercase", cfg.class)}
                  >
                    {cfg.label}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
