/**
 * Shared formatting utilities for admin pages.
 */

/** Human-readable relative time, e.g. "5m ago", "2d ago" */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Format dollar cost, e.g. "$0.0042" */
export function formatCost(dollars: number | undefined | null): string {
  if (dollars == null) return "-";
  return `$${dollars.toFixed(4)}`;
}

/** Format millisecond latency as ms or seconds, e.g. "450ms", "1.2s" */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format percentage, e.g. "85.3%" */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format seconds as m:ss, e.g. "3:05". Returns "--" for nullish. */
export function formatDurationSec(seconds: number | undefined | null): string {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

/** Format milliseconds as ms/s/m, e.g. "450ms", "1.2s", "3.5m". Returns "-" for nullish. */
export function formatDurationMs(ms: number | undefined | null): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Format byte count as B/KB/MB, e.g. "1.5 MB". Returns "--" for nullish. */
export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
