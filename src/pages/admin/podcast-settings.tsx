import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminFetch } from "@/lib/admin-api";
import type { PlatformConfigEntry } from "@/types/admin";

interface CatalogConfigDef {
  key: string;
  label: string;
  type: "number" | "boolean";
  description: string;
  default: number | boolean;
}

// Mirrors FEED_REFRESH_MAX_CONSUMERS in worker/lib/constants.ts — requires redeploy to change
const FEED_REFRESH_MAX_CONSUMERS = 50;

const CATALOG_CONFIGS: CatalogConfigDef[] = [
  { key: "catalog.seedSize", label: "Catalog Seed Size", type: "number", description: "Podcasts to fetch during catalog-refresh", default: 200 },
  { key: "catalog.refreshAllPodcasts", label: "Refresh All Podcasts", type: "boolean", description: "Refresh all catalog podcasts (not just subscribed)", default: false },
  { key: "catalog.requests.enabled", label: "User Requests Enabled", type: "boolean", description: "Allow users to request new podcasts", default: true },
  { key: "catalog.requests.maxPerUser", label: "Max Requests Per User", type: "number", description: "Maximum pending requests per user", default: 5 },
  { key: "catalog.cleanup.inactivityThresholdDays", label: "Cleanup Inactivity Threshold", type: "number", description: "Days inactive before suggesting removal", default: 90 },
  { key: "episodes.aging.enabled", label: "Episode Aging Enabled", type: "boolean", description: "Enable episode aging deletion", default: false },
  { key: "episodes.aging.maxAgeDays", label: "Episode Max Age", type: "number", description: "Days before episodes are deletion candidates", default: 180 },
  { key: "pipeline.feedRefresh.maxEpisodesPerPodcast", label: "Max Episodes per Podcast", type: "number", description: "Episodes ingested per podcast during feed refresh", default: 5 },
  { key: "pipeline.feedRefresh.batchConcurrency", label: "Batch Concurrency", type: "number", description: "Podcasts processed in parallel per queue message", default: 10 },
  { key: "pipeline.feedRefresh.fetchTimeoutMs", label: "RSS Fetch Timeout (ms)", type: "number", description: "Timeout for each RSS feed request", default: 10000 },
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
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">Catalog & Episodes</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">Catalog refresh, user requests, and episode lifecycle settings</p>
      </div>

      <div className="space-y-2">
        {CATALOG_CONFIGS.map((cfg) => {
          const currentValue = getConfigValue(cfg.key, cfg.default);
          return (
            <div
              key={cfg.key}
              className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
            >
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

        <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-4">
              <Label className="text-xs text-[#F9FAFB]">Max Concurrent Consumers</Label>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">Max parallel queue workers (deploy-time setting, requires redeploy to change)</p>
            </div>
            <span className="text-xs font-mono text-[#9CA3AF] tabular-nums">{FEED_REFRESH_MAX_CONSUMERS}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
