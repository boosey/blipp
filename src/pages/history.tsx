import { useMemo } from "react";
import { Flame, Play, ThumbsUp, ThumbsDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useFetch } from "../lib/use-fetch";
import { useAudio } from "../contexts/audio-context";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import {
  groupByDate,
  formatDuration,
  computeStreak,
  computeWeeklyActivity,
} from "../lib/feed-utils";
import { relativeTime } from "../lib/admin-formatters";
import type { FeedItem } from "../types/feed";

/* ─── Skeleton ─── */
function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex items-end justify-center gap-1 pb-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton
                key={i}
                className="w-3 rounded-sm"
                style={{ height: `${12 + Math.random() * 20}px` }}
              />
            ))}
          </div>
        </div>
      </div>
      {/* Item skeletons */}
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

/* ─── Source badge config ─── */
const SOURCE_STYLE: Record<string, { label: string; className: string }> = {
  SUBSCRIPTION: {
    label: "Sub",
    className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  ON_DEMAND: {
    label: "OD",
    className: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  SHARED: {
    label: "Shared",
    className: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
};

/* ─── Stats Hero ─── */
function StatsHero({
  items,
  totalSeconds,
  savedSeconds,
}: {
  items: FeedItem[];
  totalSeconds: number;
  savedSeconds: number;
}) {
  const streak = useMemo(() => computeStreak(items), [items]);
  const activity = useMemo(() => computeWeeklyActivity(items), [items]);
  const maxCount = Math.max(...activity.map((a) => a.count), 1);

  const totalOriginalSeconds = items.reduce(
    (sum, i) => sum + (i.episode.durationSeconds ?? 0),
    0
  );
  const savedPct =
    totalOriginalSeconds > 0
      ? Math.round((savedSeconds / totalOriginalSeconds) * 100)
      : 0;
  const savedMins = Math.round(savedSeconds / 60);
  const savedHrs = Math.floor(savedMins / 60);
  const savedRemMins = savedMins % 60;
  const savedLabel =
    savedHrs > 0 ? `${savedHrs}h ${savedRemMins}m` : `${savedMins}m`;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.06] to-transparent p-4 mb-5">
      <div className="grid grid-cols-3 gap-3">
        {/* Streak */}
        <div className="flex flex-col items-center justify-center gap-1">
          <div
            className={`relative flex items-center justify-center ${
              streak >= 3 ? "streak-glow" : ""
            }`}
          >
            <Flame
              className={`w-5 h-5 ${
                streak > 0
                  ? "text-orange-500 dark:text-orange-400"
                  : "text-muted-foreground/40"
              }`}
            />
            <span className="text-2xl font-bold ml-1 tabular-nums">
              {streak}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">
            {streak === 1 ? "day streak" : "day streak"}
          </span>
        </div>

        {/* Time Saved Ring */}
        <div className="flex flex-col items-center justify-center gap-1">
          <div
            className="relative w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(
                var(--color-primary) ${savedPct * 3.6}deg,
                var(--color-border) ${savedPct * 3.6}deg
              )`,
            }}
          >
            {/* Inner circle cutout */}
            <div className="absolute w-10 h-10 rounded-full bg-background flex items-center justify-center">
              <span className="text-xs font-bold tabular-nums">{savedLabel}</span>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">
            saved
          </span>
        </div>

        {/* 7-Day Activity */}
        <div className="flex flex-col items-center justify-end gap-1">
          <div className="flex items-end gap-[3px] h-10">
            {activity.map((a, i) => (
              <div
                key={i}
                className={`w-3 rounded-sm transition-all duration-500 ease-out ${
                  a.isToday
                    ? "bg-primary"
                    : a.count > 0
                    ? "bg-muted-foreground/30"
                    : "bg-muted-foreground/10"
                }`}
                style={{
                  height: a.count > 0 ? `${Math.max(4, (a.count / maxCount) * 32)}px` : "4px",
                  transitionDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
          <div className="flex gap-[3px]">
            {activity.map((a, i) => (
              <span
                key={i}
                className={`w-3 text-center text-[8px] leading-none ${
                  a.isToday ? "text-primary font-semibold" : "text-muted-foreground/50"
                }`}
              >
                {a.day}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground">
          <strong className="text-foreground tabular-nums">{items.length}</strong> briefings
        </span>
        <span className="text-[11px] text-muted-foreground">
          <strong className="text-foreground tabular-nums">{Math.round(totalSeconds / 60)}</strong> min listened
        </span>
      </div>
    </div>
  );
}

/* ─── Waveform playing indicator ─── */
function WaveformBars() {
  return (
    <div className="flex items-center gap-[2px] h-4">
      {[0, 0.2, 0.4].map((delay) => (
        <div
          key={delay}
          className="waveform-bar w-[2px] rounded-full bg-primary"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

/* ─── History Item Card ─── */
function HistoryItemCard({
  item,
  index,
  isPlaying,
  onPlay,
}: {
  item: FeedItem;
  index: number;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const clipSeconds = item.briefing?.clip?.actualSeconds ?? 0;
  const progressPct =
    item.playbackPositionSeconds && clipSeconds > 0
      ? Math.min((item.playbackPositionSeconds / clipSeconds) * 100, 100)
      : null;

  const sourceCfg = SOURCE_STYLE[item.source];

  return (
    <button
      className="w-full text-left flex items-center gap-3 bg-card border border-border rounded-lg p-3 relative overflow-hidden active:scale-[0.99] transition-transform duration-75 feed-item-enter"
      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
      onClick={onPlay}
      disabled={!item.briefing?.clip}
    >
      {/* Podcast image + source badge */}
      <div className="relative w-10 h-10 flex-shrink-0">
        {item.podcast.imageUrl ? (
          <img
            src={item.podcast.imageUrl}
            alt=""
            className="w-10 h-10 rounded object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
            <span className="text-sm font-bold text-muted-foreground">
              {item.podcast.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {sourceCfg && (
          <Badge
            variant="outline"
            className={`absolute -top-1.5 -right-1.5 text-[7px] leading-none px-1 py-0.5 rounded-full ${sourceCfg.className}`}
          >
            {sourceCfg.label}
          </Badge>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.episode.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.podcast.title}
        </p>
      </div>

      {/* Right side: vote, duration, time ago, play/waveform */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.episodeVote === 1 && (
          <ThumbsUp className="w-3 h-3 text-emerald-500/70" />
        )}
        {item.episodeVote === -1 && (
          <ThumbsDown className="w-3 h-3 text-red-400/70" />
        )}
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground block leading-tight">
            {formatDuration(clipSeconds, item.durationTier)}
          </span>
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            {relativeTime(item.listenedAt)}
          </span>
        </div>
        {isPlaying ? (
          <WaveformBars />
        ) : (
          <Play className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Bottom progress bar */}
      {progressPct !== null && (
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-primary/50 rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      )}
    </button>
  );
}

/* ─── Empty State ─── */
function HistoryEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      {/* Ghost cards */}
      <div className="relative w-48 h-20">
        <div className="absolute inset-x-4 top-0 h-14 rounded-lg border border-border/20 bg-card/20 rotate-[-2deg]" />
        <div className="absolute inset-x-2 top-2 h-14 rounded-lg border border-border/30 bg-card/30 rotate-[0.5deg]" />
        <div className="absolute inset-x-0 top-4 h-14 rounded-lg border border-border/40 bg-card/40 rotate-[1deg]" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-foreground/80">
          Your listening story starts here
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Every briefing you play will appear here. Go explore!
        </p>
      </div>
      <Link
        to="/home"
        className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg"
      >
        Go to Feed
      </Link>
    </div>
  );
}

/* ─── Main Component ─── */
export default function History() {
  const { data, loading } = useFetch<{ items: FeedItem[]; total: number }>(
    "/feed?listened=true&sort=listenedAt&limit=100"
  );
  const audio = useAudio();

  const items = data?.items ?? [];

  const totalSeconds = useMemo(
    () => items.reduce((sum, i) => sum + (i.briefing?.clip?.actualSeconds ?? 0), 0),
    [items]
  );
  const savedSeconds = useMemo(
    () =>
      items.reduce(
        (sum, i) =>
          sum +
          (i.episode.durationSeconds ?? 0) -
          (i.briefing?.clip?.actualSeconds ?? 0),
        0
      ),
    [items]
  );

  const groups = useMemo(() => groupByDate(items, "listenedAt"), [items]);

  if (loading) {
    return <HistorySkeleton />;
  }

  if (items.length === 0) {
    return <HistoryEmptyState />;
  }

  return (
    <div>
      <StatsHero
        items={items}
        totalSeconds={totalSeconds}
        savedSeconds={savedSeconds}
      />

      {/* Date-grouped items */}
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.items.map((item, index) => (
              <HistoryItemCard
                key={item.id}
                item={item}
                index={index}
                isPlaying={audio.currentItem?.id === item.id}
                onPlay={() => audio.play(item)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
