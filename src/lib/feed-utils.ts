import type { FeedItem } from "../types/feed";

export function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** Count consecutive days with at least one listened item, starting from today backward. */
export function computeStreak(items: FeedItem[]): number {
  const daySet = new Set<string>();
  for (const item of items) {
    if (item.listenedAt) {
      const d = new Date(item.listenedAt);
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (daySet.has(key)) {
      streak++;
    } else if (i > 0) {
      // Allow today to be missing (streak counts backward from yesterday if today hasn't started yet)
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Return listening activity for the last 7 calendar days. */
export function computeWeeklyActivity(
  items: FeedItem[]
): { day: string; count: number; isToday: boolean }[] {
  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
  const today = new Date();
  const result: { day: string; count: number; isToday: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let count = 0;
    for (const item of items) {
      if (item.listenedAt) {
        const ld = new Date(item.listenedAt);
        if (`${ld.getFullYear()}-${ld.getMonth()}-${ld.getDate()}` === key) {
          count++;
        }
      }
    }
    result.push({ day: DAY_LABELS[d.getDay()], count, isToday: i === 0 });
  }
  return result;
}

export function groupByDate(
  items: FeedItem[],
  dateKey: "listenedAt" | "createdAt" = "createdAt"
) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const groups = new Map<string, FeedItem[]>();

  for (const item of items) {
    const date = new Date(
      dateKey === "listenedAt"
        ? (item.listenedAt ?? item.createdAt)
        : item.createdAt
    );
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

export function formatDuration(
  actualSeconds: number | null | undefined,
  tier: number
): string {
  if (actualSeconds && actualSeconds > 0) {
    const m = Math.floor(actualSeconds / 60);
    const s = Math.floor(actualSeconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return `${tier}m`;
}
