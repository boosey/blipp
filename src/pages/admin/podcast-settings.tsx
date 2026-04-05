import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminFetch } from "@/lib/admin-api";
import type { PlatformConfigEntry } from "@/types/admin";

interface ConfigDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "readonly";
  description: string;
  default: number | boolean;
}

interface ConfigGroup {
  title: string;
  description: string;
  items: ConfigDef[];
}

// Mirrors FEED_REFRESH_MAX_CONSUMERS in worker/lib/constants.ts — requires redeploy to change
const FEED_REFRESH_MAX_CONSUMERS = 50;

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    title: "Catalog Discovery",
    description: "How new podcasts are discovered and added to the library",
    items: [
      { key: "catalog.seedSize", label: "Discovery Batch Size", type: "number", description: "Podcasts to fetch during catalog refresh", default: 20 },
      { key: "catalog.maxSize", label: "Catalog Size Limit", type: "number", description: "Max podcasts in catalog. Least-ranked PI podcasts are evicted when full.", default: 10000 },
      { key: "catalog.refreshAllPodcasts", label: "Refresh All Podcasts", type: "boolean", description: "Refresh all catalog podcasts (not just subscribed)", default: false },
    ],
  },
  {
    title: "User Requests",
    description: "Controls for user-submitted podcast requests",
    items: [
      { key: "catalog.requests.enabled", label: "Requests Enabled", type: "boolean", description: "Allow users to request new podcasts", default: true },
      { key: "catalog.requests.maxPerUser", label: "Max Requests Per User", type: "number", description: "Maximum pending requests per user", default: 5 },
    ],
  },
  {
    title: "New Episodes Fetch",
    description: "RSS feed polling and episode ingestion",
    items: [
      { key: "pipeline.feedRefresh.maxEpisodesPerPodcast", label: "Max Episodes per Podcast", type: "number", description: "Episodes ingested per podcast during feed refresh", default: 5 },
      { key: "pipeline.feedRefresh.batchConcurrency", label: "Batch Concurrency", type: "number", description: "Podcasts processed in parallel per queue message", default: 10 },
      { key: "pipeline.feedRefresh.fetchTimeoutMs", label: "RSS Fetch Timeout (ms)", type: "number", description: "Timeout for each RSS feed request", default: 10000 },
      { key: "pipeline.feedRefresh.maxConcurrentConsumers", label: "Max Concurrent Consumers", type: "readonly", description: "Max parallel queue workers (deploy-time constant, requires redeploy)", default: FEED_REFRESH_MAX_CONSUMERS },
    ],
  },
  {
    title: "Content Prefetch",
    description: "Transcript and audio validation before pipeline processing",
    items: [
      { key: "pipeline.contentPrefetch.fetchTimeoutMs", label: "Fetch Timeout (ms)", type: "number", description: "Timeout for transcript/audio validation requests", default: 15000 },
    ],
  },
  {
    title: "Data Lifecycle",
    description: "Cleanup and aging rules for podcasts and episodes",
    items: [
      { key: "catalog.cleanup.inactivityThresholdDays", label: "Inactivity Threshold (days)", type: "number", description: "Days inactive before suggesting podcast removal", default: 90 },
      { key: "episodes.aging.enabled", label: "Episode Aging Enabled", type: "boolean", description: "Enable automatic episode deletion by age", default: false },
      { key: "episodes.aging.maxAgeDays", label: "Episode Max Age (days)", type: "number", description: "Days before episodes are deletion candidates", default: 180 },
    ],
  },
];

function PodcastSettingsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      <Skeleton className="h-4 w-80 bg-white/5" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function PodcastSettings() {
  const apiFetch = useAdminFetch();
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config");
      setConfigs(res.data.flatMap((g) => g.entries));
    } catch (e) {
      console.error("Failed to load config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const updateConfig = useCallback(
    async (key: string, value: unknown) => {
      setSaving(key);
      try {
        await apiFetch(`/config/${key}`, {
          method: "PATCH",
          body: JSON.stringify({ value }),
        });
        await load();
      } catch (e) {
        console.error("Failed to update config:", e);
      } finally {
        setSaving(null);
      }
    },
    [apiFetch, load]
  );

  function getConfigValue(key: string, defaultValue: number | boolean): number | boolean {
    const entry = configs.find((c) => c.key === key);
    if (entry?.value == null) return defaultValue;
    if (typeof defaultValue === "boolean") return entry.value === true || entry.value === "true";
    return Number(entry.value);
  }

  if (loading && configs.length === 0) return <PodcastSettingsSkeleton />;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">Podcast Settings</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">Catalog discovery, feed refresh, and data lifecycle configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {CONFIG_GROUPS.map((group) => (
        <div key={group.title} className="bg-[#0F1D32] border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 border-l-2 border-l-[#14B8A6] bg-white/[0.03]">
            <h3 className="text-sm font-bold text-[#F9FAFB]">{group.title}</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">{group.description}</p>
          </div>

          <div className="divide-y divide-white/5">
            {group.items.map((cfg) => {
              const currentValue = getConfigValue(cfg.key, cfg.default);
              return (
                <div key={cfg.key} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 mr-4">
                      <Label className="text-xs text-[#F9FAFB]">{cfg.label}</Label>
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{cfg.description}</p>
                    </div>

                    {cfg.type === "boolean" ? (
                      <Switch
                        checked={currentValue as boolean}
                        onCheckedChange={(v) => updateConfig(cfg.key, v)}
                        disabled={saving === cfg.key}
                        className="data-[state=checked]:bg-[#14B8A6]"
                      />
                    ) : cfg.type === "readonly" ? (
                      <span className="text-xs font-mono text-[#9CA3AF] tabular-nums">{cfg.default}</span>
                    ) : (
                      <Input
                        type="number"
                        min={1}
                        value={currentValue as number}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value));
                          updateConfig(cfg.key, val);
                        }}
                        disabled={saving === cfg.key}
                        className="w-24 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
