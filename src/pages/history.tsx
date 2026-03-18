import { History as HistoryIcon, Play } from "lucide-react";
import { useFetch } from "../lib/use-fetch";
import { useAudio } from "../contexts/audio-context";
import { EmptyState } from "../components/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import type { FeedItem } from "../types/feed";

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function groupByDate(items: FeedItem[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const groups = new Map<string, FeedItem[]>();

  for (const item of items) {
    const date = new Date(item.listenedAt ?? item.createdAt);
    let label: string;
    if (isSameDay(date, today)) label = "Today";
    else if (isSameDay(date, yesterday)) label = "Yesterday";
    else if (date > weekAgo) label = "This Week";
    else
      label = date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
      });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

function formatMinutes(seconds: number | null | undefined) {
  if (!seconds) return "0";
  return Math.round(seconds / 60).toString();
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

export default function History() {
  const { data, loading } = useFetch<{ items: FeedItem[]; total: number }>(
    "/feed?listened=true&sort=listenedAt&limit=100"
  );
  const audio = useAudio();

  const items = data?.items ?? [];
  const totalBriefings = items.length;
  const totalSeconds = items.reduce(
    (sum, i) => sum + (i.briefing?.clip?.actualSeconds ?? 0),
    0
  );
  const totalMinutes = Math.round(totalSeconds / 60);
  const savedSeconds = items.reduce(
    (sum, i) =>
      sum +
      (i.episode.durationSeconds ?? 0) -
      (i.briefing?.clip?.actualSeconds ?? 0),
    0
  );
  const savedMinutes = Math.round(savedSeconds / 60);

  if (loading) {
    return <HistorySkeleton />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="No listening history"
        description="Play a briefing and it will show up here."
        action={{ label: "Go to Feed", to: "/home" }}
      />
    );
  }

  const groups = groupByDate(items);

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalBriefings}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Briefings</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalMinutes}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Min listened</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{savedMinutes}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Min saved</p>
        </div>
      </div>

      {/* Date-grouped items */}
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.items.map((item) => (
              <button
                key={item.id}
                className="w-full text-left flex items-center gap-3 bg-card border border-border rounded-lg p-3"
                onClick={() => audio.play(item)}
                disabled={!item.briefing?.clip}
              >
                {item.podcast.imageUrl ? (
                  <img
                    src={item.podcast.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.episode.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.podcast.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {formatMinutes(item.briefing?.clip?.actualSeconds)}m
                  </span>
                  <Play className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
