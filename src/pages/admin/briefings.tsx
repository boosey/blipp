import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Search,
  Flag,
  RefreshCw,
  Trash2,
  Clock,
  Mic,
  BarChart3,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminBriefing,
  AdminBriefingDetail,
  AdminBriefingSegment,
} from "@/types/admin";

// ── Helpers ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function tierBadgeClass(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS":
    case "PRO+":
      return "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30";
    case "PRO":
      return "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

function tierLabel(tier: string) {
  switch (tier.toUpperCase()) {
    case "PRO_PLUS": return "PRO+";
    case "PRO": return "PRO";
    default: return "FREE";
  }
}

function fitColor(accuracy: number) {
  if (accuracy >= 95) return "text-[#10B981]";
  if (accuracy >= 90) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30";
    case "failed":
      return "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30";
    default:
      return "bg-white/5 text-[#9CA3AF] border-white/10";
  }
}

// ── Radial Gauge ──

function RadialGauge({ value, size = 80, label }: { value: number; size?: number; label: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 95 ? "#10B981" : value >= 90 ? "#F59E0B" : "#EF4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={4} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          className="rotate-90 origin-center"
          fill="#F9FAFB" fontSize={size * 0.2} fontWeight="bold" fontFamily="monospace"
        >
          {value.toFixed(0)}%
        </text>
      </svg>
      <span className="text-[10px] text-[#9CA3AF]">{label}</span>
    </div>
  );
}

// ── Waveform Placeholder ──

function WaveformVisualization({ segments }: { segments: AdminBriefingSegment[] }) {
  const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6", "#EF4444", "#F97316"];
  const totalDuration = segments.reduce((s, seg) => s + seg.clipDuration, 0) || 1;

  return (
    <div className="h-40 rounded-lg bg-[#0A1628] border border-white/5 overflow-hidden flex">
      {segments.map((seg, i) => {
        const width = (seg.clipDuration / totalDuration) * 100;
        return (
          <div
            key={seg.id}
            className="h-full relative flex items-end justify-center"
            style={{ width: `${width}%`, backgroundColor: `${colors[i % colors.length]}10` }}
          >
            {/* Fake waveform bars */}
            <div className="absolute inset-0 flex items-center justify-center gap-px px-1">
              {Array.from({ length: Math.max(4, Math.floor(width / 2)) }).map((_, j) => {
                const h = 20 + Math.random() * 60;
                return (
                  <div
                    key={j}
                    className="flex-1 rounded-full opacity-60"
                    style={{
                      height: `${h}%`,
                      backgroundColor: colors[i % colors.length],
                      maxWidth: 3,
                    }}
                  />
                );
              })}
            </div>
            <span className="absolute bottom-1 text-[8px] text-white/40 truncate px-1">
              {seg.podcastTitle}
            </span>
          </div>
        );
      })}
      {segments.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[#9CA3AF] text-xs">
          No audio segments
        </div>
      )}
    </div>
  );
}

// ── Briefing Card ──

function BriefingCard({
  briefing,
  selected,
  onClick,
}: {
  briefing: AdminBriefing;
  selected: boolean;
  onClick: () => void;
}) {
  const isFailed = briefing.status === "failed";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 space-y-2 transition-all",
        selected
          ? "bg-[#3B82F6]/10 border-[#3B82F6]/30"
          : "bg-[#1A2942] border-white/5 hover:border-white/10",
        isFailed && "border-l-2 border-l-[#EF4444] bg-[#EF4444]/[0.04]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#F9FAFB] truncate">{briefing.userEmail}</span>
          <Badge className={cn("text-[9px] uppercase shrink-0", tierBadgeClass(briefing.userTier))}>
            {tierLabel(briefing.userTier)}
          </Badge>
        </div>
        <Badge className={cn("text-[9px] uppercase shrink-0", statusBadge(briefing.status))}>
          {briefing.status}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
        <span>{relativeTime(briefing.createdAt)}</span>
        {briefing.actualSeconds != null && (
          <span>{formatDuration(briefing.actualSeconds)}</span>
        )}
        {briefing.fitAccuracy != null && (
          <span className={cn("font-mono tabular-nums", fitColor(briefing.fitAccuracy))}>
            {briefing.fitAccuracy.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
        <span>{briefing.podcastCount} podcast{briefing.podcastCount !== 1 ? "s" : ""}</span>
        <span>{briefing.segmentCount} segment{briefing.segmentCount !== 1 ? "s" : ""}</span>
      </div>
    </button>
  );
}

// ── Segment Card ──

function SegmentCard({
  segment,
  isPlaying,
}: {
  segment: AdminBriefingSegment;
  isPlaying: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/5 p-3 flex items-start gap-3 transition-all",
        isPlaying ? "border-l-2 border-l-[#3B82F6] bg-[#3B82F6]/[0.04]" : "bg-[#0A1628]"
      )}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-mono text-[#9CA3AF] w-4 text-right">{segment.orderIndex + 1}</span>
        {segment.podcastImageUrl ? (
          <img src={segment.podcastImageUrl} alt="" className="h-8 w-8 rounded object-cover" />
        ) : (
          <div className="h-8 w-8 rounded bg-white/5 flex items-center justify-center">
            <Mic className="h-3 w-3 text-[#9CA3AF]" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {isPlaying && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3B82F6] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3B82F6]" />
            </span>
          )}
          <span className="text-xs text-[#F9FAFB] truncate">{segment.episodeTitle}</span>
        </div>
        <div className="text-[10px] text-[#9CA3AF]">{segment.podcastTitle}</div>

        {/* Duration bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3B82F6]/60"
              style={{ width: `${Math.min((segment.clipDuration / 120) * 100, 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-[#9CA3AF] tabular-nums">
            {formatDuration(segment.clipDuration)}
          </span>
        </div>

        {segment.transitionText && (
          <p className="text-[10px] text-[#9CA3AF]/60 italic leading-relaxed line-clamp-2">
            {segment.transitionText}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ──

function BriefingSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      <div className="w-80 shrink-0 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 bg-white/5 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-40 bg-white/5 rounded-lg" />
        <Skeleton className="h-60 bg-white/5 rounded-lg" />
      </div>
      <div className="w-[360px] shrink-0 space-y-4">
        <Skeleton className="h-48 bg-white/5 rounded-lg" />
        <Skeleton className="h-64 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main ──

export default function BriefingsPage() {
  const apiFetch = useAdminFetch();

  const [briefings, setBriefings] = useState<AdminBriefing[]>([]);
  const [selected, setSelected] = useState<AdminBriefingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Audio state
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    apiFetch<{ data: AdminBriefing[] }>(`/briefings?${params}`)
      .then((r) => setBriefings(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const selectBriefing = useCallback(
    (id: string) => {
      setDetailLoading(true);
      apiFetch<{ data: AdminBriefingDetail }>(`/briefings/${id}`)
        .then((r) => {
          setSelected(r.data);
          setCurrentSegment(0);
          setPlaying(false);
        })
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  if (loading && briefings.length === 0) return <BriefingSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── LEFT: Briefing List ── */}
      <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
        {/* Filters */}
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-28 bg-[#1A2942] border-white/5 text-xs text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 pl-7 text-xs bg-[#1A2942] border-white/5 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {briefings.map((b) => (
              <BriefingCard
                key={b.id}
                briefing={b}
                selected={selected?.id === b.id}
                onClick={() => selectBriefing(b.id)}
              />
            ))}
            {briefings.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <Clock className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No briefings found</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── CENTER: Player & Segments ── */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#F9FAFB] font-medium">{selected.userEmail}</span>
                <Badge className={cn("text-[9px] uppercase", tierBadgeClass(selected.userTier))}>
                  {tierLabel(selected.userTier)}
                </Badge>
                <span className="text-xs text-[#9CA3AF]">{relativeTime(selected.createdAt)}</span>
              </div>
              <Badge className={cn("text-[9px] uppercase", statusBadge(selected.status))}>
                {selected.status}
              </Badge>
            </div>

            {/* Waveform */}
            <WaveformVisualization segments={selected.segments} />

            {/* Playback Controls */}
            <div className="rounded-lg bg-[#1A2942] border border-white/5 p-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => setCurrentSegment((p) => Math.max(0, p - 1))}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white rounded-full"
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </Button>
                <Button
                  variant="ghost" size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => setCurrentSegment((p) => Math.min(selected.segments.length - 1, p + 1))}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6 bg-white/5" />

              {/* Speed selector */}
              <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
                <SelectTrigger size="sm" className="w-16 bg-transparent border-white/5 text-xs text-[#9CA3AF]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2942] border-white/10">
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="1.25">1.25x</SelectItem>
                  <SelectItem value="1.5">1.5x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                </SelectContent>
              </Select>

              {/* Volume */}
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="ghost" size="icon-xs"
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </Button>
                <input
                  type="range" min={0} max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                  className="w-20 h-1 accent-[#3B82F6] bg-white/5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#3B82F6]"
                />
              </div>

              {selected.audioUrl && (
                <Button variant="ghost" size="icon-xs" className="text-[#9CA3AF] hover:text-[#F9FAFB]" asChild>
                  <a href={selected.audioUrl} download>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>

            {/* Segment Breakdown */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-[#F9FAFB]">Segments</span>
              <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">
                {selected.segments.length}
              </Badge>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {selected.segments.map((seg, i) => (
                  <SegmentCard
                    key={seg.id}
                    segment={seg}
                    isPlaying={i === currentSegment && playing}
                  />
                ))}
                {selected.segments.length === 0 && (
                  <div className="text-center py-8 text-[#9CA3AF] text-xs">No segments</div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <Mic className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Select a briefing to view details</span>
          </div>
        )}
      </div>

      {/* ── RIGHT: Context Panel ── */}
      <div className="w-[360px] shrink-0 flex flex-col gap-4 min-h-0">
        {selected ? (
          <>
            {/* User Context */}
            <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#14B8A6]" />
                <span className="text-sm font-semibold">User Context</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Email</span>
                  <span className="text-[#F9FAFB] truncate ml-2">{selected.userEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Tier</span>
                  <Badge className={cn("text-[9px] uppercase", tierBadgeClass(selected.userTier))}>
                    {tierLabel(selected.userTier)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Target Duration</span>
                  <span className="text-[#F9FAFB] font-mono tabular-nums">{selected.targetMinutes}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Podcasts</span>
                  <span className="text-[#F9FAFB] font-mono tabular-nums">{selected.podcastCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Segments</span>
                  <span className="text-[#F9FAFB] font-mono tabular-nums">{selected.segmentCount}</span>
                </div>
              </div>
            </div>

            {/* Quality Metrics */}
            <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-4 flex-1 min-h-0 overflow-auto">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-sm font-semibold">Quality Metrics</span>
              </div>

              {selected.qualityMetrics ? (
                <div className="space-y-4">
                  {/* Time-Fitting Accuracy */}
                  <div className="flex justify-center">
                    <RadialGauge value={selected.qualityMetrics.fitAccuracy} size={96} label="Time-Fitting" />
                  </div>

                  {/* Content Coverage */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#9CA3AF]">Content Coverage</span>
                      <span className="font-mono tabular-nums text-[#F9FAFB]">
                        {selected.qualityMetrics.contentCoverage}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3B82F6] transition-all"
                        style={{ width: `${selected.qualityMetrics.contentCoverage}%` }}
                      />
                    </div>
                  </div>

                  {/* Segment Balance */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#9CA3AF]">Segment Balance</span>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
                      {selected.qualityMetrics.segmentBalance.map((seg, i) => {
                        const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6"];
                        return (
                          <div
                            key={seg.podcast}
                            className="h-full first:rounded-l-full last:rounded-r-full"
                            style={{
                              width: `${seg.percentage}%`,
                              backgroundColor: colors[i % colors.length],
                            }}
                            title={`${seg.podcast}: ${seg.percentage}%`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {selected.qualityMetrics.segmentBalance.map((seg, i) => {
                        const colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#14B8A6"];
                        return (
                          <div key={seg.podcast} className="flex items-center gap-1 text-[9px]">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                            <span className="text-[#9CA3AF] truncate max-w-[100px]">{seg.podcast}</span>
                            <span className="text-[#F9FAFB] font-mono tabular-nums">{seg.percentage}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transition Quality */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#9CA3AF]">Transition Quality</span>
                    <Badge
                      className={cn(
                        "text-[9px] uppercase",
                        selected.qualityMetrics.transitionQuality === "good"
                          ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                          : "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                      )}
                    >
                      {selected.qualityMetrics.transitionQuality === "good" ? "Good" : "Needs Review"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-[#9CA3AF]">
                  <BarChart3 className="h-6 w-6 mb-2 opacity-30" />
                  <span className="text-xs">No quality data</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-2">
              <Button size="sm" className="w-full bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25 border border-[#F59E0B]/20">
                <Flag className="h-3.5 w-3.5" /> Flag for Review
              </Button>
              <Button size="sm" className="w-full bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 border border-[#3B82F6]/20">
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button size="sm" className="w-full bg-[#EF4444]/15 text-[#EF4444] hover:bg-[#EF4444]/25 border border-[#EF4444]/20">
                <Trash2 className="h-3.5 w-3.5" /> Delete Preview
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <BarChart3 className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">Select a briefing</span>
          </div>
        )}
      </div>
    </div>
  );
}
