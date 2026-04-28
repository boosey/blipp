import { useState } from "react";
import { Mail, BarChart3, Podcast, Heart, Headphones, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdminUserDetail } from "@/types/admin";
import { formatDate, relativeTime, planBadgeClass } from "./helpers";

export interface OverviewTabProps {
  user: AdminUserDetail;
}

type SelectedStat = "briefings" | "listened" | "subscriptions" | "favorites" | null;

export function OverviewTab({ user }: OverviewTabProps) {
  const [selected, setSelected] = useState<SelectedStat>(null);

  const briefings = user.briefings ?? [];
  const listenedItems = user.listenedItems ?? [];
  const subscriptions = user.subscriptions ?? [];
  const favorites = user.favorites ?? [];

  const toggle = (stat: SelectedStat) =>
    setSelected((prev) => (prev === stat ? null : stat));

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
        <div className="grid grid-cols-4 gap-3">
          <StatTile
            label="Total Briefings"
            value={user.briefingCount}
            active={selected === "briefings"}
            onClick={() => toggle("briefings")}
          />
          <StatTile
            label="Listened"
            value={user.listenedCount ?? 0}
            active={selected === "listened"}
            onClick={() => toggle("listened")}
          />
          <StatTile
            label="Subscriptions"
            value={subscriptions.length}
            active={selected === "subscriptions"}
            onClick={() => toggle("subscriptions")}
          />
          <StatTile
            label="Favorites"
            value={favorites.length}
            active={selected === "favorites"}
            onClick={() => toggle("favorites")}
          />
        </div>
      </div>

      {/* Selected list */}
      {selected === "briefings" && (
        <ListPane
          icon={<FileAudio className="h-4 w-4 text-[#F59E0B]" />}
          title="Briefings"
          count={user.briefingCount}
          empty="No briefings yet"
        >
          {briefings.map((b) => (
            <RowWithImage
              key={b.id}
              imageUrl={b.podcastImageUrl}
              title={b.episodeTitle ?? "Untitled episode"}
              subtitle={b.podcastTitle}
              right={formatDate(b.createdAt)}
            />
          ))}
        </ListPane>
      )}

      {selected === "listened" && (
        <ListPane
          icon={<Headphones className="h-4 w-4 text-[#14B8A6]" />}
          title="Listened"
          count={user.listenedCount ?? 0}
          empty="No listened briefings yet"
        >
          {listenedItems.map((fi) => (
            <RowWithImage
              key={fi.id}
              imageUrl={fi.podcastImageUrl}
              title={fi.episodeTitle ?? "Untitled episode"}
              subtitle={fi.podcastTitle}
              right={formatDate(fi.listenedAt ?? fi.createdAt)}
            />
          ))}
        </ListPane>
      )}

      {selected === "subscriptions" && (
        <ListPane
          icon={<Podcast className="h-4 w-4 text-[#8B5CF6]" />}
          title="Subscriptions"
          count={subscriptions.length}
          empty="No subscriptions"
        >
          {subscriptions.map((sub) => (
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
        </ListPane>
      )}

      {selected === "favorites" && (
        <ListPane
          icon={<Heart className="h-4 w-4 text-[#EF4444]" />}
          title="Favorites"
          count={favorites.length}
          empty="No favorites"
        >
          {favorites.map((fav) => (
            <RowWithImage
              key={fav.podcastId}
              imageUrl={fav.podcastImageUrl}
              title={fav.podcastTitle}
              right={formatDate(fav.favoritedAt)}
            />
          ))}
        </ListPane>
      )}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}

function StatTile({ label, value, active, onClick }: StatTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg bg-[#0A1628] border p-3 text-center transition-colors cursor-pointer",
        "hover:border-[#14B8A6]/60 hover:bg-[#0A1628]/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]",
        active ? "border-[#14B8A6] ring-1 ring-[#14B8A6]/40" : "border-white/5"
      )}
    >
      <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
        {value}
      </div>
      <div className="text-[10px] text-[#9CA3AF]">{label}</div>
    </button>
  );
}

interface ListPaneProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}

function ListPane({ icon, title, count, empty, children }: ListPaneProps) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some((c) => c);
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-[#F9FAFB]">{title}</span>
        <Badge className="bg-white/5 text-[#9CA3AF] text-[9px] ml-auto">{count}</Badge>
      </div>
      {hasItems ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <div className="text-xs text-[#9CA3AF] italic">{empty}</div>
      )}
    </div>
  );
}

interface RowWithImageProps {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  right?: string;
}

function RowWithImage({ imageUrl, title, subtitle, right }: RowWithImageProps) {
  return (
    <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[#0A1628] border border-white/5">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-6 h-6 rounded flex-shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded bg-[#1A2942] flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] font-bold text-[#9CA3AF]">
            {title?.charAt(0)?.toUpperCase()}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[#F9FAFB] truncate">{title}</div>
        {subtitle && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{subtitle}</div>
        )}
      </div>
      {right && (
        <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">{right}</span>
      )}
    </div>
  );
}
