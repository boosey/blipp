import type { FeedHealth, PodcastStatus } from "@/types/admin";

export const HEALTH_CONFIG: Record<FeedHealth, { color: string; label: string }> = {
  excellent: { color: "#10B981", label: "Excellent" },
  good: { color: "#3B82F6", label: "Good" },
  fair: { color: "#F59E0B", label: "Fair" },
  poor: { color: "#F97316", label: "Poor" },
  broken: { color: "#EF4444", label: "Broken" },
};

export const STATUS_LABELS: Record<PodcastStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  pending_deletion: "Pending Deletion",
};

export const SOURCE_CONFIG: Record<string, { color: string; label: string }> = {
  apple: { color: "#A855F7", label: "Apple" },
  "podcast-index": { color: "#3B82F6", label: "PI" },
  manual: { color: "#F59E0B", label: "Manual" },
};

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}
