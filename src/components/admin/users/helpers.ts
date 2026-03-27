import type { UserSegment } from "@/types/admin";
import {
  User,
  AlertTriangle,
  Clock,
  Zap,
  UserX,
} from "lucide-react";

// ── Formatting helpers ──

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "Never";
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

// ── Badge / status class helpers ──

export function planBadgeClass(slug: string) {
  switch (slug) {
    case "pro-plus":
      return "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30";
    case "pro":
      return "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

export function statusDotClass(status: string) {
  switch (status) {
    case "active":
      return "bg-[#10B981]";
    case "inactive":
      return "bg-[#9CA3AF]";
    case "churned":
      return "bg-[#EF4444]";
    default:
      return "bg-[#9CA3AF]";
  }
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30";
    case "inactive":
      return "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30";
    case "churned":
      return "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

export function userBadgeConfig(badge: string) {
  switch (badge) {
    case "power_user":
      return { label: "Power User", class: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" };
    case "at_risk":
      return { label: "At Risk", class: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30" };
    case "trial":
      return { label: "Trial", class: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30" };
    case "admin":
      return { label: "Admin", class: "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30" };
    default:
      return { label: badge, class: "bg-white/5 text-[#9CA3AF] border-white/10" };
  }
}

export function initials(name?: string, email?: string): string {
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

// ── Segment filter config ──

export interface SegmentDef {
  key: UserSegment;
  label: string;
  icon: React.ElementType;
  color: string;
}

export const SEGMENT_FILTERS: SegmentDef[] = [
  { key: "all", label: "All Users", icon: User, color: "#3B82F6" },
  { key: "power_users", label: "Power Users", icon: Zap, color: "#10B981" },
  { key: "at_risk", label: "At Risk", icon: AlertTriangle, color: "#EF4444" },
  { key: "trial_ending", label: "Trial Ending", icon: Clock, color: "#F59E0B" },
  { key: "never_active", label: "Never Active", icon: UserX, color: "#9CA3AF" },
];
