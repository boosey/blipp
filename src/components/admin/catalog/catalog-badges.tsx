import type { FeedHealth, PodcastStatus } from "@/types/admin";
import { HEALTH_CONFIG, STATUS_LABELS, SOURCE_CONFIG } from "./catalog-utils";

export function HealthBadge({ health }: { health: FeedHealth | undefined }) {
  if (!health) return null;
  const cfg = HEALTH_CONFIG[health];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: PodcastStatus }) {
  const color = status === "active" ? "#10B981" : status === "paused" ? "#F59E0B" : status === "pending_deletion" ? "#F59E0B" : "#9CA3AF";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SourceBadge({ source }: { source: string | undefined }) {
  const cfg = SOURCE_CONFIG[source ?? ""] ?? { color: "#6B7280", label: source ?? "?" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
