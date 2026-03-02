import { useState, useEffect, useCallback } from "react";
import {
  Search,
  User,
  AlertTriangle,
  Clock,
  CreditCard,
  Mail,
  Zap,
  UserX,
  Shield,
  BarChart3,
  Podcast,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminUser,
  AdminUserDetail,
  UserSegment,
  UserSegmentCounts,
  UserTier,
  AdminBriefing,
  PaginatedResponse,
} from "@/types/admin";

// ── Helpers ──

function relativeTime(iso: string | undefined): string {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tierBadgeClass(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS":
      return "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30";
    case "PRO":
      return "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

function tierLabel(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS":
      return "PRO+";
    case "PRO":
      return "PRO";
    default:
      return "FREE";
  }
}

function statusDotClass(status: string) {
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

function statusBadgeClass(status: string) {
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

function userBadgeConfig(badge: string) {
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

function initials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0]?.[0]?.toUpperCase() ?? "?";
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

function initialsColor(id: string): string {
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6", "#EF4444", "#F97316"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

// ── Segment filter config ──

interface SegmentDef {
  key: UserSegment;
  label: string;
  icon: React.ElementType;
  color: string;
}

const SEGMENT_FILTERS: SegmentDef[] = [
  { key: "all", label: "All Users", icon: User, color: "#3B82F6" },
  { key: "power_users", label: "Power Users", icon: Zap, color: "#10B981" },
  { key: "at_risk", label: "At Risk", icon: AlertTriangle, color: "#EF4444" },
  { key: "trial_ending", label: "Trial Ending", icon: Clock, color: "#F59E0B" },
  { key: "never_active", label: "Never Active", icon: UserX, color: "#9CA3AF" },
];

// ── User Row Card ──

function UserRow({
  user,
  selected,
  onClick,
}: {
  user: AdminUser;
  selected: boolean;
  onClick: () => void;
}) {
  const color = initialsColor(user.id);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-all",
        selected
          ? "border-l-2 border-l-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30"
          : "bg-[#1A2942] border-white/5 hover:border-white/10"
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        {user.imageUrl && <AvatarImage src={user.imageUrl} />}
        <AvatarFallback
          style={{ backgroundColor: `${color}20`, color }}
          className="text-xs font-medium"
        >
          {initials(user.name ?? undefined, user.email)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#F9FAFB] truncate font-medium">
            {user.name || user.email}
          </span>
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotClass(user.status))} />
          <Badge className={cn("text-[9px] uppercase shrink-0", tierBadgeClass(user.tier))}>
            {tierLabel(user.tier)}
          </Badge>
        </div>

        {user.name && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{user.email}</div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
          <span className="font-mono tabular-nums">
            {user.briefingCount} briefing{user.briefingCount !== 1 ? "s" : ""}
          </span>
          <span className="font-mono tabular-nums">
            {user.podcastCount} podcast{user.podcastCount !== 1 ? "s" : ""}
          </span>
          {user.badges.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              {user.badges.slice(0, 2).map((b) => {
                const cfg = userBadgeConfig(b);
                return (
                  <Badge key={b} className={cn("text-[8px] uppercase px-1 py-0", cfg.class)}>
                    {cfg.label}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Overview Tab ──

function OverviewTab({ user }: { user: AdminUserDetail }) {
  return (
    <div className="space-y-4">
      {/* Account Info */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#14B8A6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Account Info</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Email</span>
            <span className="text-[#F9FAFB] truncate ml-4">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Name</span>
            <span className="text-[#F9FAFB]">{user.name || "Not set"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Tier</span>
            <Badge className={cn("text-[9px] uppercase", tierBadgeClass(user.tier))}>
              {tierLabel(user.tier)}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Signup Date</span>
            <span className="text-[#F9FAFB]">{formatDate(user.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Last Active</span>
            <span className="text-[#F9FAFB]">{relativeTime(user.lastActiveAt)}</span>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Usage Stats</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.briefingCount}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">Total Briefings</div>
          </div>
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.recentBriefings?.filter(
                (b) =>
                  new Date(b.createdAt) >
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              ).length ?? 0}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">This Week</div>
          </div>
          <div className="rounded-lg bg-[#0A1628] border border-white/5 p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-[#F9FAFB]">
              {user.podcastCount}
            </div>
            <div className="text-[10px] text-[#9CA3AF]">Podcasts</div>
          </div>
        </div>
      </div>

      {/* Top Podcasts */}
      {user.subscriptions.length > 0 && (
        <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Podcast className="h-4 w-4 text-[#8B5CF6]" />
            <span className="text-sm font-semibold text-[#F9FAFB]">Top Podcasts</span>
            <Badge className="bg-white/5 text-[#9CA3AF] text-[9px] ml-auto">
              {user.subscriptions.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {user.subscriptions.slice(0, 8).map((sub) => (
              <div
                key={sub.podcastId}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[#0A1628] border border-white/5"
              >
                <span className="text-[#F9FAFB] truncate">{sub.podcastTitle}</span>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">
                  since {formatDate(sub.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Briefings Tab ──

function BriefingsTab({ briefings }: { briefings: AdminBriefing[] }) {
  const failed = briefings.filter((b) => b.status === "failed");

  return (
    <div className="space-y-3">
      {failed.length > 0 && (
        <div className="rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0" />
          <span className="text-xs text-[#EF4444]">
            {failed.length} failed briefing{failed.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Date
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Status
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Duration
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Fit Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {briefings.map((b) => (
              <tr
                key={b.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2 text-[#F9FAFB]">{formatDate(b.createdAt)}</td>
                <td className="px-3 py-2">
                  <Badge
                    className={cn(
                      "text-[9px] uppercase",
                      b.status === "completed"
                        ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                        : b.status === "failed"
                          ? "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"
                          : "bg-white/5 text-[#9CA3AF] border-white/10"
                    )}
                  >
                    {b.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                  {b.actualSeconds != null
                    ? `${Math.floor(b.actualSeconds / 60)}m ${Math.floor(b.actualSeconds % 60)
                        .toString()
                        .padStart(2, "0")}s`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {b.fitAccuracy != null ? (
                    <span
                      className={
                        b.fitAccuracy >= 95
                          ? "text-[#10B981]"
                          : b.fitAccuracy >= 90
                            ? "text-[#F59E0B]"
                            : "text-[#EF4444]"
                      }
                    >
                      {b.fitAccuracy.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-[#9CA3AF]">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {briefings.length === 0 && (
          <div className="text-center py-8 text-[#9CA3AF] text-xs">No briefings yet</div>
        )}
      </div>
    </div>
  );
}

// ── Billing Tab ──

function BillingTab({
  user,
  onUpdate,
}: {
  user: AdminUserDetail;
  onUpdate: () => void;
}) {
  const apiFetch = useAdminFetch();
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<UserTier>(user.tier);
  const [saving, setSaving] = useState(false);

  const handleTierSave = useCallback(() => {
    if (selectedTier === user.tier) return;
    setSaving(true);
    apiFetch(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tier: selectedTier }),
    })
      .then(() => {
        setTierModalOpen(false);
        onUpdate();
      })
      .catch(console.error)
      .finally(() => setSaving(false));
  }, [apiFetch, user.id, user.tier, selectedTier, onUpdate]);

  const handleAdminToggle = useCallback(
    (isAdmin: boolean) => {
      setSaving(true);
      apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAdmin }),
      })
        .then(() => onUpdate())
        .catch(console.error)
        .finally(() => setSaving(false));
    },
    [apiFetch, user.id, onUpdate]
  );

  return (
    <div className="space-y-4">
      {/* Subscription Card */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Subscription</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Current Tier</span>
            <Badge className={cn("text-[9px] uppercase", tierBadgeClass(user.tier))}>
              {tierLabel(user.tier)}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9CA3AF]">Signup Date</span>
            <span className="text-[#F9FAFB]">{formatDate(user.createdAt)}</span>
          </div>
          {user.stripeCustomerId && (
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Stripe ID</span>
              <span className="text-[#F9FAFB] font-mono text-[10px] truncate ml-4">
                {user.stripeCustomerId}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Actions */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Admin Actions</span>
        </div>

        <Button
          size="sm"
          className="w-full bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 border border-[#3B82F6]/20"
          onClick={() => {
            setSelectedTier(user.tier);
            setTierModalOpen(true);
          }}
        >
          <CreditCard className="h-3.5 w-3.5" /> Change Tier
        </Button>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs text-[#F9FAFB]">Admin Access</Label>
            <div className="text-[10px] text-[#9CA3AF]">
              Grant admin privileges to this user
            </div>
          </div>
          <Switch
            checked={user.isAdmin}
            onCheckedChange={handleAdminToggle}
            disabled={saving}
          />
        </div>
      </div>

      {/* Change Tier Modal */}
      <Dialog open={tierModalOpen} onOpenChange={setTierModalOpen}>
        <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
          <DialogHeader>
            <DialogTitle className="text-sm">Change Tier for {user.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as UserTier)}>
              <SelectTrigger className="bg-[#0A1628] border-white/5 text-[#F9FAFB]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2942] border-white/10">
                <SelectItem value="FREE">FREE</SelectItem>
                <SelectItem value="PRO">PRO</SelectItem>
                <SelectItem value="PRO_PLUS">PRO+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTierModalOpen(false)}
              className="text-[#9CA3AF]"
            >
              Cancel
            </Button>
            <Button
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
              disabled={saving || selectedTier === user.tier}
              onClick={handleTierSave}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Loading Skeleton ──

function UsersSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <div className="w-[40%] space-y-3">
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <Skeleton className="h-8 bg-white/5 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 bg-white/5 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-24 bg-white/5 rounded-lg" />
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <Skeleton className="h-64 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main ──

export default function UsersPage() {
  const apiFetch = useAdminFetch();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [segmentCounts, setSegmentCounts] = useState<UserSegmentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [segment, setSegment] = useState<UserSegment>("all");
  const [search, setSearch] = useState("");

  const loadSegments = useCallback(() => {
    apiFetch<{ data: UserSegmentCounts }>("/users/segments")
      .then((r) => setSegmentCounts(r.data))
      .catch(console.error);
  }, [apiFetch]);

  const loadUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("pageSize", "50");
    if (segment !== "all") params.set("segment", segment);
    if (search) params.set("search", search);
    apiFetch<PaginatedResponse<AdminUser>>(`/users?${params}`)
      .then((r) => setUsers(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, segment, search]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectUser = useCallback(
    (id: string) => {
      setDetailLoading(true);
      apiFetch<{ data: AdminUserDetail }>(`/users/${id}`)
        .then((r) => setSelectedUser(r.data))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  const handleUserUpdate = useCallback(() => {
    if (selectedUser) {
      selectUser(selectedUser.id);
      loadUsers();
      loadSegments();
    }
  }, [selectedUser, selectUser, loadUsers, loadSegments]);

  if (loading && users.length === 0) return <UsersSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── LEFT: User List (40%) ── */}
      <div className="w-[40%] flex flex-col gap-3 min-h-0">
        {/* Segment Quick Filters */}
        <div className="flex flex-wrap gap-1.5">
          {SEGMENT_FILTERS.map((sf) => {
            const count = segmentCounts?.[sf.key] ?? 0;
            const isActive = segment === sf.key;
            const Icon = sf.icon;
            return (
              <button
                key={sf.key}
                onClick={() => setSegment(sf.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border",
                  isActive
                    ? "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30"
                    : "bg-white/5 text-[#9CA3AF] border-white/5 hover:border-white/10"
                )}
              >
                <Icon
                  className="h-3 w-3"
                  style={{ color: isActive ? "#3B82F6" : sf.color }}
                />
                {sf.label}
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    isActive ? "text-[#3B82F6]" : "text-[#9CA3AF]/60"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="h-8 pl-8 text-xs bg-[#1A2942] border-white/5 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
          />
        </div>

        {/* User List */}
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selectedUser?.id === user.id}
                onClick={() => selectUser(user.id)}
              />
            ))}
            {users.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <UserX className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No users found</span>
              </div>
            )}
            {loading && users.length > 0 && (
              <div className="text-center py-4 text-[10px] text-[#9CA3AF]">Loading...</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT: User Detail (60%) ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {detailLoading && !selectedUser ? (
          <div className="flex-1 space-y-4">
            <Skeleton className="h-24 bg-white/5 rounded-lg" />
            <Skeleton className="h-10 bg-white/5 rounded-lg" />
            <Skeleton className="h-64 bg-white/5 rounded-lg" />
          </div>
        ) : selectedUser ? (
          <div className="flex flex-col gap-4 h-full min-h-0">
            {/* User Header */}
            <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 shrink-0">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 shrink-0">
                  {selectedUser.imageUrl && <AvatarImage src={selectedUser.imageUrl} />}
                  <AvatarFallback
                    style={{
                      backgroundColor: `${initialsColor(selectedUser.id)}20`,
                      color: initialsColor(selectedUser.id),
                    }}
                    className="text-lg font-semibold"
                  >
                    {initials(selectedUser.name ?? undefined, selectedUser.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-[#F9FAFB]">
                      {selectedUser.name || selectedUser.email}
                    </span>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        statusDotClass(selectedUser.status)
                      )}
                    />
                    <Badge
                      className={cn("text-[9px] uppercase", tierBadgeClass(selectedUser.tier))}
                    >
                      {tierLabel(selectedUser.tier)}
                    </Badge>
                    <Badge
                      className={cn("text-[9px] uppercase", statusBadgeClass(selectedUser.status))}
                    >
                      {selectedUser.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#9CA3AF] mt-1">
                    {selectedUser.name && <span>{selectedUser.email}</span>}
                    <span>Joined {formatDate(selectedUser.createdAt)}</span>
                  </div>
                  {selectedUser.badges.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {selectedUser.badges.map((b) => {
                        const cfg = userBadgeConfig(b);
                        return (
                          <Badge
                            key={b}
                            className={cn("text-[8px] uppercase", cfg.class)}
                          >
                            {cfg.label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
              <TabsList
                variant="line"
                className="border-b border-white/5 w-full justify-start shrink-0"
              >
                <TabsTrigger
                  value="overview"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="briefings"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Briefings
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Billing
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 mt-4">
                <ScrollArea className="h-full">
                  <TabsContent value="overview">
                    <OverviewTab user={selectedUser} />
                  </TabsContent>
                  <TabsContent value="briefings">
                    <BriefingsTab briefings={selectedUser.recentBriefings} />
                  </TabsContent>
                  <TabsContent value="billing">
                    <BillingTab user={selectedUser} onUpdate={handleUserUpdate} />
                  </TabsContent>
                </ScrollArea>
              </div>
            </Tabs>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <User className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Select a user to view details</span>
          </div>
        )}
      </div>
    </div>
  );
}
