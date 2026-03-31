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
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-3 md:p-4 shrink-0">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 md:h-16 md:w-16 shrink-0">
          {user.imageUrl && <AvatarImage src={user.imageUrl} />}
          <AvatarFallback
            style={{
              backgroundColor: `${initialsColor(user.id)}20`,
              color: initialsColor(user.id),
            }}
            className="text-sm md:text-lg font-semibold"
          >
            {initials(user.name ?? undefined, user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm md:text-base font-semibold text-[#F9FAFB]">
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
          <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] mt-0.5 flex-wrap">
            {user.name && <span className="truncate">{user.email}</span>}
            <span className="shrink-0">Joined {formatDate(user.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
