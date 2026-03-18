import type { FeedItem } from "../types/feed";

export function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
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
