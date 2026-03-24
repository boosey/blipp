import { useFetch } from "@/lib/use-fetch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Radio,
  Activity,
  Podcast,
  FileText,
  Clock,
} from "lucide-react";
import type { PodcastSourceStats } from "@/types/admin";

const SOURCE_CONFIG: Record<string, { color: string; icon: typeof Radio; description: string }> = {
  apple: {
    color: "#A855F7",
    icon: Radio,
    description: "Apple Podcasts top 100 chart (US). Runs first during catalog refresh — authoritative for metadata.",
  },
  "podcast-index": {
    color: "#3B82F6",
    icon: Activity,
    description: "Podcast Index trending by category. Runs second — fills null fields only for Apple-sourced podcasts.",
  },
  manual: {
    color: "#F59E0B",
    icon: FileText,
    description: "Manually added podcasts via admin or user requests.",
  },
};

const HEALTH_COLORS: Record<string, string> = {
  excellent: "#10B981",
  good: "#3B82F6",
  fair: "#F59E0B",
  poor: "#F97316",
  broken: "#EF4444",
};

function HealthBar({ byHealth, total }: { byHealth: Record<string, number>; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-white/5" />;
  const keys = ["excellent", "good", "fair", "poor", "broken"];
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
      {keys.map((k) => {
        const count = byHealth[k] ?? 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={k}
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: HEALTH_COLORS[k] }}
            title={`${k}: ${count}`}
          />
        );
      })}
    </div>
  );
}

function SourceCard({ source }: { source: PodcastSourceStats }) {
  const cfg = SOURCE_CONFIG[source.identifier] ?? {
    color: "#6B7280",
    icon: Podcast,
    description: "Unknown source",
  };
  const Icon = cfg.icon;

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-5">
      <div className="flex items-start gap-4">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${cfg.color}15` }}
        >
          <Icon className="h-5 w-5" style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{source.name}</h3>
            <Badge
              className="text-[10px]"
              style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
            >
              {source.status}
            </Badge>
          </div>
          <p className="text-[11px] text-[#9CA3AF] mt-1">{cfg.description}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Podcasts</span>
          <div className="text-lg font-semibold mt-0.5">{source.podcastCount.toLocaleString()}</div>
          <span className="text-[10px] text-[#9CA3AF]">{source.percentage}% of catalog</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Episodes</span>
          <div className="text-lg font-semibold mt-0.5">{source.episodeCount.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Avg Episodes</span>
          <div className="text-lg font-semibold mt-0.5">
            {source.podcastCount > 0 ? Math.round(source.episodeCount / source.podcastCount) : 0}
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Feed Health</span>
          <div className="flex gap-2">
            {Object.entries(source.byHealth).map(([k, v]) =>
              v > 0 ? (
                <span key={k} className="text-[10px] font-mono" style={{ color: HEALTH_COLORS[k] }}>
                  {k}: {v}
                </span>
              ) : null
            )}
          </div>
        </div>
        <HealthBar byHealth={source.byHealth} total={source.podcastCount} />
      </div>

      {/* Link to catalog filtered by source */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <Link
          to={`/admin/catalog?source=${source.identifier}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
        >
          View in catalog <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

export default function PodcastSources() {
  const { data: raw, loading } = useFetch<{ data: { sources: PodcastSourceStats[]; lastRefresh: string | null } }>(
    "/admin/podcasts/sources"
  );

  if (loading || !raw?.data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { sources, lastRefresh } = raw.data;
  const totalPodcasts = sources.reduce((s, src) => s + src.podcastCount, 0);
  const totalEpisodes = sources.reduce((s, src) => s + src.episodeCount, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Podcast Sources</h1>
        <p className="text-xs text-[#9CA3AF] mt-1">
          {sources.length} sources providing {totalPodcasts.toLocaleString()} podcasts and {totalEpisodes.toLocaleString()} episodes
          {lastRefresh && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last refresh: {new Date(lastRefresh).toLocaleString()}
            </span>
          )}
        </p>
      </div>

      {/* Source cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sources.map((src) => (
          <SourceCard key={src.identifier} source={src} />
        ))}
      </div>

      {sources.length === 0 && (
        <div className="text-center py-12 text-[#9CA3AF]">
          <Podcast className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No sources found. Run a catalog refresh to populate.</p>
        </div>
      )}
    </div>
  );
}
