import { Check, X, Pause, Ban, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { EpisodeRefreshJob } from "@/types/admin";

// ── Constants ──

export const SCOPE_COLORS: Record<string, string> = {
  subscribed: "#10B981",
  all: "#3B82F6",
};

export const SCOPE_LABELS: Record<string, string> = {
  subscribed: "Subscribed",
  all: "All",
};

export function scopeBadgeStyle(scope: string) {
  const color = SCOPE_COLORS[scope] ?? "#6B7280";
  return { backgroundColor: `${color}20`, color };
}

// ── Formatters ──

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

// ── Status helpers ──

export function isActive(status: string): boolean {
  return ["pending", "refreshing"].includes(status);
}

export function isTerminal(status: string): boolean {
  return ["complete", "failed", "cancelled"].includes(status);
}

export type PhaseStatus = "pending" | "active" | "complete" | "failed" | "paused" | "cancelled";

export function getPhaseStatuses(job: EpisodeRefreshJob): [PhaseStatus, PhaseStatus] {
  if (job.status === "pending") return ["pending", "pending"];
  if (job.status === "refreshing") {
    const scanDone = job.podcastsTotal > 0 && job.podcastsCompleted >= job.podcastsTotal;
    if (scanDone) return ["complete", "active"];
    return ["active", "pending"];
  }
  if (job.status === "complete") return ["complete", "complete"];
  if (job.status === "failed") return ["failed", "failed"];
  if (job.status === "paused") return ["paused", "paused"];
  if (job.status === "cancelled") return ["cancelled", "cancelled"];
  return ["pending", "pending"];
}

export function overallProgress(job: EpisodeRefreshJob): number {
  const feedScanWeight = 0.6;
  const prefetchWeight = 0.4;
  const feedPct = job.podcastsTotal > 0 ? (job.podcastsCompleted / job.podcastsTotal) * 100 : 0;
  const prefetchPct = job.prefetchTotal > 0 ? (job.prefetchCompleted / job.prefetchTotal) * 100 : 0;
  return feedPct * feedScanWeight + prefetchPct * prefetchWeight;
}

// ── Small components ──

export function StatusIcon({ status }: { status: string }) {
  if (isActive(status)) return <Loader2 className="h-4 w-4 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-4 w-4 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "failed") return <div className="h-4 w-4 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "paused") return <div className="h-4 w-4 rounded-full bg-[#F59E0B] flex items-center justify-center"><Pause className="h-2.5 w-2.5 text-white" /></div>;
  if (status === "cancelled") return <div className="h-4 w-4 rounded-full bg-[#6B7280] flex items-center justify-center"><Ban className="h-2.5 w-2.5 text-white" /></div>;
  return <div className="h-4 w-4 rounded-full border-2 border-[#9CA3AF]/30" />;
}

export function PhaseIndicator({ status }: { status: PhaseStatus }) {
  if (status === "active") return <Loader2 className="h-5 w-5 text-[#3B82F6] animate-spin" />;
  if (status === "complete") return <div className="h-5 w-5 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>;
  if (status === "failed") return <div className="h-5 w-5 rounded-full bg-[#EF4444] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  if (status === "paused") return <div className="h-5 w-5 rounded-full bg-[#F59E0B] flex items-center justify-center"><Pause className="h-3 w-3 text-white" /></div>;
  if (status === "cancelled") return <div className="h-5 w-5 rounded-full bg-[#6B7280] flex items-center justify-center"><X className="h-3 w-3 text-white" /></div>;
  return <div className="h-5 w-5 rounded-full border-2 border-[#9CA3AF]/30" />;
}

export function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="text-xs text-[#9CA3AF]">{formatDuration(elapsed)}</span>;
}
