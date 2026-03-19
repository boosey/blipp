import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Sparkles,
  RefreshCw,
  Users,
  Brain,
  Database,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  Podcast,
  Loader2,
  Clock,
  Zap,
  Settings,
  Search,
  ChevronRight,
  ChevronDown,
  Hash,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminRecommendationStats,
  AdminRecommendationUserRow,
  AdminRecommendationUserDetail,
  AdminPodcastProfile,
  PaginatedResponse,
} from "@/types/admin";

// ── Types for new tabs ──

interface RecommendationConfigItem {
  key: string;
  value: number | boolean;
  description: string;
  isDefault: boolean;
  updatedAt: string | null;
}

interface EmbeddingsStatus {
  enabled: boolean;
  model: string;
  podcastsWithEmbeddings: number;
  podcastsTotal: number;
  usersWithEmbeddings: number;
  usersTotal: number;
  lastComputeAt: string | null;
}

interface TopicRow {
  podcastId: string;
  podcastTitle: string;
  podcastImageUrl: string | null;
  categories: string[];
  topicTags: string[];
  topicCount: number;
  computedAt: string;
}

interface EpisodeTopic {
  episodeId: string;
  episodeTitle: string;
  topicTags: string[];
  computedAt: string;
}

// ── Helpers ──

function relativeTime(iso: string | null | undefined): string {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name?: string | null, email?: string): string {
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

function cacheAgeLabel(ageMs: number | null): string {
  if (ageMs === null) return "no cache";
  return relativeTime(new Date(Date.now() - ageMs).toISOString());
}

// ── Category color palette (deterministic by name) ──

function categoryColor(name: string): string {
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6", "#F97316", "#EC4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

// ── Stat Pill ──

interface StatPillProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

function StatPill({ icon: Icon, label, value, color }: StatPillProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#1A2942] px-3 py-2 flex-1"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] text-[#9CA3AF] leading-none mb-0.5">{label}</div>
        <div className="text-xs font-mono tabular-nums font-semibold text-[#F9FAFB] truncate">
          {value}
        </div>
      </div>
    </div>
  );
}

// ── User Row ──

function UserRow({
  user,
  selected,
  onClick,
}: {
  user: AdminRecommendationUserRow;
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
          {initials(user.name, user.email)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#F9FAFB] truncate font-medium">
            {user.name || user.email}
          </span>
          {user.hasProfile ? (
            <CheckCircle2 className="h-3 w-3 text-[#10B981] shrink-0" />
          ) : (
            <span className="h-3 w-3 rounded-full border border-white/20 shrink-0" />
          )}
        </div>

        {user.name && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{user.email}</div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Clock className="h-2.5 w-2.5" />
            {cacheAgeLabel(user.cacheAge)}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Sparkles className="h-2.5 w-2.5" />
            <span className="font-mono tabular-nums">{user.cachedRecommendationCount}</span>
            {" recs"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#9CA3AF]">
            <Podcast className="h-2.5 w-2.5" />
            <span className="font-mono tabular-nums">{user.subscriptionCount}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

// ── User Detail: Profile section ──

function CategoryProfileSection({
  profile,
}: {
  profile: AdminRecommendationUserDetail["profile"];
}) {
  if (!profile) {
    return (
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-8 flex flex-col items-center justify-center text-center">
        <Brain className="h-8 w-8 text-[#9CA3AF]/30 mb-3" />
        <p className="text-xs text-[#9CA3AF]">
          No recommendation profile yet — subscribe to podcasts to generate recommendations
        </p>
      </div>
    );
  }

  const sorted = Object.entries(profile.categoryWeights).sort(([, a], [, b]) => b - a);
  const maxWeight = sorted[0]?.[1] ?? 1;

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-[#8B5CF6]" />
        <span className="text-sm font-semibold text-[#F9FAFB]">Category Profile</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-[#9CA3AF]">
          <span className="font-mono tabular-nums">{profile.listenCount} listened</span>
          <span>computed {relativeTime(profile.computedAt)}</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[#9CA3AF]">No category weights computed yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([category, weight]) => {
            const pct = (weight / maxWeight) * 100;
            const displayPct = Math.round(weight * 100);
            return (
              <div key={category} className="flex items-center gap-3">
                <span className="text-[11px] text-[#9CA3AF] w-32 shrink-0 truncate">{category}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3B82F6] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-9 text-right shrink-0">
                  {displayPct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── User Detail: Recommendations section ──

function CachedRecommendationsSection({
  cache,
}: {
  cache: AdminRecommendationUserDetail["cache"];
}) {
  if (!cache) {
    return (
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-6 flex flex-col items-center justify-center text-center">
        <Database className="h-6 w-6 text-[#9CA3AF]/30 mb-2" />
        <p className="text-xs text-[#9CA3AF]">No cached recommendations</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#F59E0B]" />
        <span className="text-sm font-semibold text-[#F9FAFB]">Cached Recommendations</span>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#9CA3AF]">
          <span>computed {relativeTime(cache.computedAt)}</span>
          <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
            {cache.recommendations.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {cache.recommendations.slice(0, 10).map((rec, idx) => (
          <div
            key={rec.podcast.id}
            className="rounded-md bg-[#0A1628] border border-white/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF]/50 w-4 shrink-0">
                {idx + 1}
              </span>
              {rec.podcast.imageUrl ? (
                <img
                  src={rec.podcast.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                  <Podcast className="h-4 w-4 text-[#9CA3AF]/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[#F9FAFB] truncate">
                  {rec.podcast.title}
                </div>
                <div className="text-[10px] text-[#9CA3AF] truncate">{rec.podcast.author}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
                  {Math.round(rec.score * 100)}%
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="flex items-center gap-2 pl-7">
              <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B82F6]/70 transition-all"
                  style={{ width: `${rec.score * 100}%` }}
                />
              </div>
            </div>

            {/* Reason tags */}
            {rec.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-7">
                {rec.reasons.map((reason) => {
                  const col = categoryColor(reason);
                  return (
                    <span
                      key={reason}
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ backgroundColor: `${col}15`, color: col }}
                    >
                      {reason}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── User Detail Panel ──

function UserDetailPanel({
  detail,
  loading,
  onRecompute,
  recomputing,
}: {
  detail: AdminRecommendationUserDetail | null;
  loading: boolean;
  onRecompute: () => void;
  recomputing: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-20 bg-white/5 rounded-lg" />
        <Skeleton className="h-8 bg-white/5 rounded-lg" />
        <Skeleton className="h-40 bg-white/5 rounded-lg" />
        <Skeleton className="h-60 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!detail) return null;

  const color = initialsColor(detail.id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 shrink-0">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            {detail.imageUrl && <AvatarImage src={detail.imageUrl} />}
            <AvatarFallback
              style={{ backgroundColor: `${color}20`, color }}
              className="text-base font-semibold"
            >
              {initials(detail.name, detail.email)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#F9FAFB] truncate">
              {detail.name || detail.email}
            </div>
            {detail.name && (
              <div className="text-xs text-[#9CA3AF] truncate">{detail.email}</div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF] mt-1">
              <span className="font-mono tabular-nums">
                {detail.subscriptionCount} subscription{detail.subscriptionCount !== 1 ? "s" : ""}
              </span>
              <span className="font-mono tabular-nums">
                {detail.favoriteCount} favorite{detail.favoriteCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <Button
            size="sm"
            disabled={recomputing}
            onClick={onRecompute}
            className="shrink-0 bg-[#8B5CF6]/15 text-[#8B5CF6] hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/20 text-xs"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {recomputing ? "Recomputing..." : "Recompute"}
          </Button>
        </div>
      </div>

      <CategoryProfileSection profile={detail.profile} />
      <CachedRecommendationsSection cache={detail.cache} />
    </div>
  );
}

// ── Podcast Profiles Table ──

function PodcastProfilesTab({
  profiles,
  loading,
  total,
}: {
  profiles: AdminPodcastProfile[];
  loading: boolean;
  total: number;
}) {
  if (loading && profiles.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <BarChart3 className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">No podcast profiles computed yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9CA3AF]">
          Showing {profiles.length} of{" "}
          <span className="font-mono tabular-nums text-[#F9FAFB]">{total}</span> profiles
        </span>
      </div>

      <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Podcast
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Categories
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-28">
                Popularity
              </th>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-28">
                Freshness
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Subs
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                Computed
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr
                key={p.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {p.podcastImageUrl ? (
                      <img
                        src={p.podcastImageUrl}
                        alt=""
                        className="h-7 w-7 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                        <Podcast className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
                      </div>
                    )}
                    <span className="text-[11px] text-[#F9FAFB] truncate max-w-[140px]">
                      {p.podcastTitle}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {p.categories.slice(0, 3).map((cat) => {
                      const col = categoryColor(cat);
                      return (
                        <span
                          key={cat}
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: `${col}15`, color: col }}
                        >
                          {cat}
                        </span>
                      );
                    })}
                    {p.categories.length > 3 && (
                      <span className="text-[9px] text-[#9CA3AF]">+{p.categories.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3B82F6]/70"
                        style={{ width: `${Math.min(p.popularity * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-7 text-right shrink-0">
                      {Math.round(p.popularity * 100)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#10B981]/70"
                        style={{ width: `${Math.min(p.freshness * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-7 text-right shrink-0">
                      {Math.round(p.freshness * 100)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                  {p.subscriberCount}
                </td>
                <td className="px-3 py-2 text-right text-[10px] text-[#9CA3AF]">
                  {relativeTime(p.computedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useAdminFetch>;
}) {
  const [config, setConfig] = useState<RecommendationConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, number | boolean>>({});

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: RecommendationConfigItem[] }>("/recommendations/config")
      .then((r) => setConfig(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (config.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <Settings className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">No configuration keys found</span>
      </div>
    );
  }

  const hasEdits = Object.keys(edits).length > 0;

  const shortLabel = (key: string) => {
    const parts = key.split(".");
    return parts.slice(1).join(".");
  };

  const isBoolean = (item: RecommendationConfigItem) =>
    typeof item.value === "boolean" ||
    item.key.includes("enabled") ||
    item.key.includes("Enabled");

  const handleSave = () => {
    setSaving(true);
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    apiFetch<{ data: unknown }>("/recommendations/config", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    })
      .then(() => {
        toast.success("Settings saved");
        setConfig((prev) =>
          prev.map((item) =>
            edits[item.key] !== undefined
              ? { ...item, value: edits[item.key], isDefault: false, updatedAt: new Date().toISOString() }
              : item
          )
        );
        setEdits({});
      })
      .catch((err) => toast.error(`Failed to save: ${err.message}`))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9CA3AF]">
          {config.length} configuration keys
        </span>
        <Button
          size="sm"
          disabled={!hasEdits || saving}
          onClick={handleSave}
          className="bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 border border-[#3B82F6]/20 text-xs disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save Changes
        </Button>
      </div>

      <div className="rounded-lg bg-[#0A1628] border border-white/5 divide-y divide-white/5">
        {config.map((item) => {
          const currentVal = edits[item.key] !== undefined ? edits[item.key] : item.value;
          const isBool = isBoolean(item);

          return (
            <div
              key={item.key}
              className="flex items-center gap-4 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#F9FAFB]">
                    {shortLabel(item.key)}
                  </span>
                  {item.isDefault && edits[item.key] === undefined && (
                    <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">default</Badge>
                  )}
                  {edits[item.key] !== undefined && (
                    <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] text-[9px]">modified</Badge>
                  )}
                </div>
                {item.description && (
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">
                    {item.description}
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {isBool ? (
                  <Switch
                    checked={currentVal as boolean}
                    onCheckedChange={(checked) =>
                      setEdits((prev) => ({ ...prev, [item.key]: checked }))
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    step={item.key.includes("weight") ? 0.05 : 1}
                    min={0}
                    max={item.key.includes("weight") ? 1 : undefined}
                    value={currentVal as number}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [item.key]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-24 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Embeddings Tab ──

function EmbeddingsTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useAdminFetch>;
}) {
  const [status, setStatus] = useState<EmbeddingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadStatus = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: EmbeddingsStatus }>("/recommendations/embeddings/status")
      .then((r) => setStatus(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = useCallback(
    (enabled: boolean) => {
      setToggling(true);
      apiFetch<{ data: unknown }>("/recommendations/config", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [{ key: "recommendations.embeddings.enabled", value: enabled }],
        }),
      })
        .then(() => {
          setStatus((prev) => (prev ? { ...prev, enabled } : prev));
          toast.success(enabled ? "Embeddings enabled" : "Embeddings disabled");
        })
        .catch((err) => toast.error(`Failed: ${err.message}`))
        .finally(() => setToggling(false));
    },
    [apiFetch]
  );

  const handleRecompute = useCallback(() => {
    setRecomputing(true);
    apiFetch<{ data: unknown }>("/recommendations/embeddings/recompute", {
      method: "POST",
    })
      .then(() => {
        toast.success("Embedding recompute started");
        loadStatus();
      })
      .catch((err) => toast.error(`Failed: ${err.message}`))
      .finally(() => setRecomputing(false));
  }, [apiFetch, loadStatus]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 bg-white/5 rounded-lg" />
        <Skeleton className="h-32 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <Cpu className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">Failed to load embeddings status</span>
      </div>
    );
  }

  const podcastPct = status.podcastsTotal > 0
    ? (status.podcastsWithEmbeddings / status.podcastsTotal) * 100
    : 0;
  const userPct = status.usersTotal > 0
    ? (status.usersWithEmbeddings / status.usersTotal) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Enable toggle + model */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F9FAFB]">Embeddings</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">
              Semantic similarity for recommendation scoring
            </div>
          </div>
          <Switch
            checked={status.enabled}
            disabled={toggling}
            onCheckedChange={handleToggle}
          />
        </div>
        <Separator className="bg-white/5" />
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-[#9CA3AF]" />
          <span className="text-[11px] text-[#9CA3AF]">Model:</span>
          <span className="text-[11px] font-mono text-[#F9FAFB]">{status.model}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-4">
        <div className="text-xs font-semibold text-[#F9FAFB]">Coverage</div>

        {/* Podcasts */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">Podcasts</span>
            <span className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
              {status.podcastsWithEmbeddings} / {status.podcastsTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#8B5CF6] transition-all"
              style={{ width: `${podcastPct}%` }}
            />
          </div>
        </div>

        {/* Users */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">Users</span>
            <span className="text-[10px] font-mono tabular-nums text-[#F9FAFB]">
              {status.usersWithEmbeddings} / {status.usersTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3B82F6] transition-all"
              style={{ width: `${userPct}%` }}
            />
          </div>
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-[#9CA3AF]">
            <Clock className="h-3 w-3" />
            Last compute: {relativeTime(status.lastComputeAt)}
          </div>
          <Button
            size="sm"
            disabled={recomputing}
            onClick={handleRecompute}
            className="bg-[#8B5CF6]/15 text-[#8B5CF6] hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/20 text-xs"
          >
            {recomputing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Recompute Embeddings
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Topics Tab ──

function TopicsTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useAdminFetch>;
}) {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedPodcast, setExpandedPodcast] = useState<string | null>(null);
  const [episodeTopics, setEpisodeTopics] = useState<Record<string, EpisodeTopic[]>>({});
  const [episodeLoading, setEpisodeLoading] = useState<string | null>(null);
  const pageSize = 20;

  const loadTopics = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search) params.set("search", search);
    apiFetch<PaginatedResponse<TopicRow>>(`/recommendations/topics?${params}`)
      .then((r) => {
        setTopics(r.data);
        setTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, page, search]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Reset to page 1 when search changes
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    []
  );

  const handleExpandPodcast = useCallback(
    (podcastId: string) => {
      if (expandedPodcast === podcastId) {
        setExpandedPodcast(null);
        return;
      }
      setExpandedPodcast(podcastId);
      if (!episodeTopics[podcastId]) {
        setEpisodeLoading(podcastId);
        apiFetch<{ data: EpisodeTopic[] }>(
          `/recommendations/topics/${podcastId}/episodes`
        )
          .then((r) =>
            setEpisodeTopics((prev) => ({ ...prev, [podcastId]: r.data }))
          )
          .catch(console.error)
          .finally(() => setEpisodeLoading(null));
      }
    },
    [apiFetch, expandedPodcast, episodeTopics]
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
        <Input
          placeholder="Search podcasts..."
          value={search}
          onChange={handleSearchChange}
          className="pl-9 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
        />
      </div>

      {loading && topics.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
          <Hash className="h-8 w-8 mb-3 opacity-20" />
          <span className="text-xs">No topic data found</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">
              Showing {topics.length} of{" "}
              <span className="font-mono tabular-nums text-[#F9FAFB]">{total}</span> podcasts
            </span>
          </div>

          <div className="rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="w-6" />
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Podcast
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Categories
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Topics
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium w-16">
                    Count
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase text-[#9CA3AF] font-medium">
                    Computed
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => {
                  const isExpanded = expandedPodcast === t.podcastId;
                  const episodes = episodeTopics[t.podcastId];
                  const isLoadingEps = episodeLoading === t.podcastId;

                  return (
                    <Fragment key={t.podcastId}>
                      <tr
                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer"
                        onClick={() => handleExpandPodcast(t.podcastId)}
                      >
                        <td className="pl-2 py-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {t.podcastImageUrl ? (
                              <img
                                src={t.podcastImageUrl}
                                alt=""
                                className="h-7 w-7 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-7 w-7 rounded bg-[#1A2942] flex items-center justify-center shrink-0">
                                <Podcast className="h-3.5 w-3.5 text-[#9CA3AF]/40" />
                              </div>
                            )}
                            <span className="text-[11px] text-[#F9FAFB] truncate max-w-[120px]">
                              {t.podcastTitle}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.categories.slice(0, 2).map((cat) => {
                              const col = categoryColor(cat);
                              return (
                                <span
                                  key={cat}
                                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                  style={{ backgroundColor: `${col}15`, color: col }}
                                >
                                  {cat}
                                </span>
                              );
                            })}
                            {t.categories.length > 2 && (
                              <span className="text-[9px] text-[#9CA3AF]">
                                +{t.categories.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.topicTags.slice(0, 3).map((tag) => {
                              const col = categoryColor(tag);
                              return (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                  style={{ backgroundColor: `${col}15`, color: col }}
                                >
                                  {tag}
                                </span>
                              );
                            })}
                            {t.topicTags.length > 3 && (
                              <span className="text-[9px] text-[#9CA3AF]">
                                +{t.topicTags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[#9CA3AF]">
                          {t.topicCount}
                        </td>
                        <td className="px-3 py-2 text-right text-[10px] text-[#9CA3AF]">
                          {relativeTime(t.computedAt)}
                        </td>
                      </tr>

                      {/* Expanded episode rows */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-[#0F1D32] px-4 py-3">
                            {isLoadingEps ? (
                              <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <Skeleton key={i} className="h-8 bg-white/5 rounded" />
                                ))}
                              </div>
                            ) : !episodes || episodes.length === 0 ? (
                              <div className="text-[10px] text-[#9CA3AF] text-center py-4">
                                No episode-level topics
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {episodes.map((ep) => (
                                  <div
                                    key={ep.episodeId}
                                    className="flex items-center gap-3 rounded bg-[#1A2942]/50 px-3 py-2"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[10px] text-[#F9FAFB] truncate">
                                        {ep.episodeTitle}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 shrink-0">
                                      {ep.topicTags.slice(0, 4).map((tag) => {
                                        const col = categoryColor(tag);
                                        return (
                                          <span
                                            key={tag}
                                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                            style={{
                                              backgroundColor: `${col}15`,
                                              color: col,
                                            }}
                                          >
                                            {tag}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <span className="text-[10px] text-[#9CA3AF] shrink-0">
                                      {relativeTime(ep.computedAt)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                Previous
              </Button>
              <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Loading Skeleton ──

function RecommendationsSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <div className="w-[40%] space-y-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 flex-1 bg-white/5 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-9 bg-white/5 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 bg-white/5 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-20 bg-white/5 rounded-lg" />
        <Skeleton className="h-10 bg-white/5 rounded-lg" />
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main ──

export default function RecommendationsPage() {
  const apiFetch = useAdminFetch();

  // Stats
  const [stats, setStats] = useState<AdminRecommendationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // User list
  const [users, setUsers] = useState<AdminRecommendationUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);

  // User detail
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminRecommendationUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Podcast profiles
  const [podcastProfiles, setPodcastProfiles] = useState<AdminPodcastProfile[]>([]);
  const [podcastProfilesTotal, setPodcastProfilesTotal] = useState(0);
  const [podcastProfilesLoading, setPodcastProfilesLoading] = useState(false);
  const [podcastProfilesLoaded, setPodcastProfilesLoaded] = useState(false);

  // Actions
  const [recomputingAll, setRecomputingAll] = useState(false);
  const [recomputedAllCount, setRecomputedAllCount] = useState<number | null>(null);
  const [recomputingUser, setRecomputingUser] = useState(false);

  // Right pane tab
  const [rightTab, setRightTab] = useState<
    "user" | "podcasts" | "settings" | "embeddings" | "topics"
  >("user");

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    apiFetch<{ data: AdminRecommendationStats }>("/recommendations/stats")
      .then((r) => setStats(r.data))
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, [apiFetch]);

  const loadUsers = useCallback(() => {
    setUsersLoading(true);
    apiFetch<PaginatedResponse<AdminRecommendationUserRow>>(
      "/recommendations/users?page=1&pageSize=30"
    )
      .then((r) => {
        setUsers(r.data);
        setUsersTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setUsersLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    loadStats();
    loadUsers();
  }, [loadStats, loadUsers]);

  const loadUserDetail = useCallback(
    (userId: string) => {
      setDetailLoading(true);
      setUserDetail(null);
      apiFetch<{ data: AdminRecommendationUserDetail }>(`/recommendations/users/${userId}`)
        .then((r) => setUserDetail(r.data))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  const handleSelectUser = useCallback(
    (userId: string) => {
      setSelectedUserId(userId);
      setRightTab("user");
      loadUserDetail(userId);
    },
    [loadUserDetail]
  );

  const handleRecomputeAll = useCallback(() => {
    setRecomputingAll(true);
    setRecomputedAllCount(null);
    apiFetch<{ data: { recomputed: number } }>("/recommendations/recompute", { method: "POST" })
      .then((r) => {
        setRecomputedAllCount(r.data.recomputed);
        loadStats();
        loadUsers();
      })
      .catch(console.error)
      .finally(() => setRecomputingAll(false));
  }, [apiFetch, loadStats, loadUsers]);

  const handleRecomputeUser = useCallback(() => {
    if (!selectedUserId) return;
    setRecomputingUser(true);
    apiFetch<{ data: { userId: string; recomputed: boolean } }>(
      `/recommendations/users/${selectedUserId}/recompute`,
      { method: "POST" }
    )
      .then(() => {
        loadUserDetail(selectedUserId);
        loadStats();
        loadUsers();
      })
      .catch(console.error)
      .finally(() => setRecomputingUser(false));
  }, [apiFetch, selectedUserId, loadUserDetail, loadStats, loadUsers]);

  const handlePodcastProfilesTabChange = useCallback(() => {
    setRightTab("podcasts");
    if (!podcastProfilesLoaded) {
      setPodcastProfilesLoading(true);
      apiFetch<PaginatedResponse<AdminPodcastProfile>>(
        "/recommendations/podcast-profiles?page=1&pageSize=30"
      )
        .then((r) => {
          setPodcastProfiles(r.data);
          setPodcastProfilesTotal(r.total);
          setPodcastProfilesLoaded(true);
        })
        .catch(console.error)
        .finally(() => setPodcastProfilesLoading(false));
    }
  }, [apiFetch, podcastProfilesLoaded]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (value === "podcasts") {
        handlePodcastProfilesTabChange();
      } else {
        setRightTab(value as typeof rightTab);
      }
    },
    [handlePodcastProfilesTabChange]
  );

  if (usersLoading && users.length === 0 && statsLoading) {
    return <RecommendationsSkeleton />;
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── LEFT PANE ── */}
      <div className="w-[40%] flex flex-col gap-3 min-h-0">
        {/* Stats Bar */}
        <div className="flex gap-2">
          {statsLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 flex-1 bg-white/5 rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <StatPill
                icon={Users}
                label="Users Profiled"
                value={stats?.usersWithProfiles ?? 0}
                color="#3B82F6"
              />
              <StatPill
                icon={Podcast}
                label="Podcasts Profiled"
                value={stats?.podcastsWithProfiles ?? 0}
                color="#8B5CF6"
              />
              <StatPill
                icon={Zap}
                label="Cache Rate"
                value={
                  stats != null
                    ? `${Math.round(stats.cacheHitRate * 100)}%`
                    : "-"
                }
                color="#10B981"
              />
              <StatPill
                icon={TrendingUp}
                label="Last Compute"
                value={relativeTime(stats?.lastComputeAt)}
                color="#F59E0B"
              />
            </>
          )}
        </div>

        {/* Recompute All Button */}
        <Button
          size="sm"
          disabled={recomputingAll}
          onClick={handleRecomputeAll}
          className="w-full bg-[#1A2942] border border-white/5 hover:border-white/10 text-[#F9FAFB] text-xs gap-2"
        >
          {recomputingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
          {recomputingAll
            ? "Recomputing Podcast Profiles..."
            : recomputedAllCount !== null
              ? `Recompute Podcast Profiles — ${recomputedAllCount} updated`
              : "Recompute Podcast Profiles"}
        </Button>

        {/* User List */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] text-[#9CA3AF]">
            <span className="font-mono tabular-nums text-[#F9FAFB]">{usersTotal}</span>
            {" users"}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selectedUserId === user.id}
                onClick={() => handleSelectUser(user.id)}
              />
            ))}
            {users.length === 0 && !usersLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <Users className="h-6 w-6 mb-2 opacity-30" />
                <span className="text-xs">No users found</span>
              </div>
            )}
            {usersLoading && users.length > 0 && (
              <div className="text-center py-4 text-[10px] text-[#9CA3AF]">Loading...</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT PANE ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs
          value={rightTab}
          onValueChange={handleTabChange}
          className="flex flex-col h-full min-h-0"
        >
          <TabsList
            variant="line"
            className="border-b border-white/5 w-full justify-start shrink-0"
          >
            <TabsTrigger
              value="user"
              className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
            >
              User Detail
            </TabsTrigger>
            <TabsTrigger
              value="podcasts"
              className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
            >
              Podcast Profiles
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="embeddings"
              className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
            >
              Embeddings
            </TabsTrigger>
            <TabsTrigger
              value="topics"
              className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
            >
              Topics
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4">
            {/* User Detail Tab */}
            <TabsContent value="user" className="h-full">
              {detailLoading || userDetail ? (
                <ScrollArea className="h-full">
                  <div className="pr-2 pb-4">
                    <UserDetailPanel
                      detail={userDetail}
                      loading={detailLoading}
                      onRecompute={handleRecomputeUser}
                      recomputing={recomputingUser}
                    />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#9CA3AF]">
                  <Sparkles className="h-10 w-10 mb-3 opacity-20" />
                  <span className="text-sm">Select a user to view recommendation details</span>
                </div>
              )}
            </TabsContent>

            {/* Podcast Profiles Tab */}
            <TabsContent value="podcasts" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <PodcastProfilesTab
                    profiles={podcastProfiles}
                    loading={podcastProfilesLoading}
                    total={podcastProfilesTotal}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <SettingsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Embeddings Tab */}
            <TabsContent value="embeddings" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <EmbeddingsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Topics Tab */}
            <TabsContent value="topics" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <TopicsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
