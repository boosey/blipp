// Shared helpers for recommendations components

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function initials(name?: string | null, email?: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0]?.[0]?.toUpperCase() ?? "?";
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function initialsColor(id: string): string {
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6", "#EF4444", "#F97316"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export function cacheAgeLabel(ageMs: number | null): string {
  if (ageMs === null) return "no cache";
  return relativeTime(new Date(Date.now() - ageMs).toISOString());
}

export function categoryColor(name: string): string {
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6", "#F97316", "#EC4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
