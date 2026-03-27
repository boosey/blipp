import type { CatalogSeedJob } from "@/types/admin";

export const SOURCE_COLORS: Record<string, string> = {
  apple: "#A855F7",
  "podcast-index": "#3B82F6",
  manual: "#F59E0B",
};

export const SOURCE_LABELS: Record<string, string> = {
  apple: "Apple",
  "podcast-index": "Podcast Index",
  manual: "Manual",
};

export function sourceBadgeStyle(source: string) {
  const color = SOURCE_COLORS[source] ?? "#6B7280";
  return { backgroundColor: `${color}20`, color };
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isActive(status: string): boolean {
  return ["pending", "discovering", "upserting"].includes(status);
}

export function isTerminal(status: string): boolean {
  return ["complete", "failed", "cancelled"].includes(status);
}

export function discoveryProgress(job: CatalogSeedJob): number {
  if (job.status === "complete") return 100;
  if (job.status === "upserting") return 80;
  if (job.status === "discovering") return job.podcastsDiscovered > 0 ? 50 : 20;
  if (job.status === "pending") return 5;
  return 0;
}
