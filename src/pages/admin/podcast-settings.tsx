import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, MapPin } from "lucide-react";
import { useAdminFetch } from "@/lib/api-client";
import type { PlatformConfigEntry } from "@/types/admin";

interface AiProvider {
  id: string;
  provider: string;
  providerLabel: string;
  providerModelId: string | null;
  model: { label: string; modelId: string };
}

interface ConfigDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "readonly" | "select";
  description: string;
  default: number | boolean | string;
  options?: { value: string; label: string }[];
  warning?: string;
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
      {
        key: "catalog.source",
        label: "Default Discovery Source",
        type: "select",
        description: "Which external source the discovery cron uses. Podcast Index is free and open; Apple has richer metadata but stricter rate limits.",
        default: "podcast-index",
        options: [
          { value: "podcast-index", label: "Podcast Index" },
          { value: "apple", label: "Apple Podcasts" },
        ],
      },
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
      { key: "pipeline.feedRefresh.maxRetries", label: "Max Fetch Retries", type: "number", description: "Retry attempts on retryable HTTP errors (429, 5xx) with exponential backoff", default: 3 },
      { key: "pipeline.feedRefresh.maxConcurrentConsumers", label: "Max Concurrent Consumers", type: "readonly", description: "Max parallel queue workers (deploy-time constant, requires redeploy)", default: FEED_REFRESH_MAX_CONSUMERS },
    ],
  },
  {
    title: "Content Prefetch",
    description: "Transcript and audio validation before pipeline processing",
    items: [
      { key: "pipeline.contentPrefetch.fetchTimeoutMs", label: "Fetch Timeout (ms)", type: "number", description: "Timeout for transcript/audio validation requests", default: 15000 },
      { key: "recommendations.profileBatchSize", label: "Recommendation Batch Size", type: "number", description: "Podcasts per batch (loops until cycle completes or time budget hit)", default: 25 },
      { key: "recommendations.timeBudgetMs", label: "Time Budget (ms)", type: "number", description: "Max time to spend processing batches per cron run", default: 25000 },
    ],
  },
  {
    title: "Data Lifecycle",
    description: "Cleanup and aging rules for podcasts and episodes",
    items: [
      {
        key: "catalog.cleanup.enabled",
        label: "Catalog Cleanup Reporting",
        type: "boolean",
        description: "When enabled, the data-retention cron counts stale podcasts (no subscribers) and reports the count for monitoring. No podcasts are deleted today — this is a reporting-only flag. Does NOT affect automatic eviction triggered by the Catalog Size Limit.",
        default: false,
        warning: "If disabled, the admin dashboard will not show a cleanup-candidate count during data retention runs. The Catalog Size Limit eviction process (triggered during catalog refresh) runs independently and is unaffected.",
      },
      { key: "catalog.cleanup.inactivityThresholdDays", label: "Inactivity Threshold (days)", type: "number", description: "Days inactive before suggesting podcast removal", default: 90 },
      { key: "episodes.aging.enabled", label: "Episode Aging Enabled", type: "boolean", description: "Enable automatic episode deletion by age", default: false },
      { key: "episodes.aging.maxAgeDays", label: "Episode Max Age (days)", type: "number", description: "Days before episodes are deletion candidates", default: 180 },
    ],
  },
];

/** Number input that holds local state and saves on blur to avoid focus loss. */
function NumberConfigInput({
  value,
  onSave,
  saving,
}: {
  value: number;
  onSave: (val: number) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const prevValue = useRef(value);

  // Sync from server when the server value changes (not from our own save)
  useEffect(() => {
    if (value !== prevValue.current) {
      setLocal(String(value));
      prevValue.current = value;
    }
  }, [value]);

  const commit = () => {
    const num = Math.max(1, Number(local) || 1);
    setLocal(String(num));
    if (num !== value) {
      onSave(num);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className="relative">
      <Input
        type="number"
        min={1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        className="w-24 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
      />
      {saving && (
        <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[10px]">…</span>
      )}
      {saved && !saving && (
        <Check className="absolute -right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#14B8A6]" />
      )}
    </div>
  );
}

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
  const [geoProviders, setGeoProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { id: string; label: string; modelId: string; providers: any[] }[] }>("/ai-models?stage=geoClassification");
      const providers: AiProvider[] = [];
      for (const model of res.data) {
        for (const p of model.providers) {
          if (p.isAvailable) {
            providers.push({
              id: p.id,
              provider: p.provider,
              providerLabel: p.providerLabel,
              providerModelId: p.providerModelId,
              model: { label: model.label, modelId: model.modelId },
            });
          }
        }
      }
      setGeoProviders(providers);
    } catch {
      // ignore — providers just won't be available
    }
  }, [apiFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config?owner=podcast-settings");
      setConfigs(res.data.flatMap((g) => g.entries));
    } catch (e) {
      console.error("Failed to load config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); loadProviders(); }, [load, loadProviders]);

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

  function getStringConfig(key: string, defaultValue: string): string {
    const entry = configs.find((c) => c.key === key);
    return entry?.value != null ? String(entry.value) : defaultValue;
  }

  function getConfigValue(key: string, defaultValue: number | boolean): number | boolean {
    const entry = configs.find((c) => c.key === key);
    if (entry?.value == null) return defaultValue;
    if (typeof defaultValue === "boolean") return entry.value === true || entry.value === "true";
    return Number(entry.value);
  }

  function renderControl(cfg: ConfigDef) {
    if (cfg.type === "boolean") {
      return (
        <Switch
          checked={getConfigValue(cfg.key, cfg.default as boolean) as boolean}
          onCheckedChange={(v) => updateConfig(cfg.key, v)}
          disabled={saving === cfg.key}
          className="data-[state=checked]:bg-[#14B8A6]"
        />
      );
    }
    if (cfg.type === "readonly") {
      return <span className="text-xs font-mono text-[#9CA3AF] tabular-nums">{String(cfg.default)}</span>;
    }
    if (cfg.type === "select") {
      return (
        <Select
          value={getStringConfig(cfg.key, cfg.default as string)}
          onValueChange={(v) => updateConfig(cfg.key, v)}
          disabled={saving === cfg.key}
        >
          <SelectTrigger className="w-48 h-8 text-[11px] bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            {(cfg.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <NumberConfigInput
        value={getConfigValue(cfg.key, cfg.default as number) as number}
        onSave={(val) => updateConfig(cfg.key, val)}
        saving={saving === cfg.key}
      />
    );
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
            {group.items.map((cfg) => (
              <div key={cfg.key} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Label className="text-xs text-[#F9FAFB]">{cfg.label}</Label>
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">{cfg.description}</p>
                    {cfg.warning && (
                      <p className="text-[10px] text-[#F59E0B] mt-1 border-l-2 border-[#F59E0B]/40 pl-2">
                        {cfg.warning}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 pt-0.5">{renderControl(cfg)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Geo-Tagging */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 border-l-2 border-l-[#8B5CF6] bg-white/[0.03] flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#8B5CF6]" />
          <div>
            <h3 className="text-sm font-bold text-[#F9FAFB]">Geo-Tagging</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Classify podcasts by geographic market. Pass 1 uses keyword matching; Pass 2 uses LLM for unmatched Sports podcasts.
            </p>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {/* LLM Provider */}
          <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 mr-4">
                <Label className="text-xs text-[#F9FAFB]">LLM Provider</Label>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                  Model used for Pass 2 classification of unmatched Sports podcasts. Leave empty to skip LLM pass.
                </p>
              </div>
              <Select
                value={getStringConfig("geoClassification.llmProviderId", "") || "__none__"}
                onValueChange={(v) => updateConfig("geoClassification.llmProviderId", v === "__none__" ? "" : v)}
                disabled={saving === "geoClassification.llmProviderId"}
              >
                <SelectTrigger className="w-56 h-8 text-[11px] bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                  <SelectValue placeholder="None (keyword only)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                  <SelectItem value="__none__" className="text-xs">None (keyword only)</SelectItem>
                  {geoProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.model.label} — {p.providerLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {geoProviders.length === 0 && (
              <p className="text-[10px] text-[#F59E0B] mt-2">
                No models tagged with geoClassification stage. Add one in AI → Model Registry.
              </p>
            )}
          </div>

          {/* Batch Size */}
          <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 mr-4">
                <Label className="text-xs text-[#F9FAFB]">Podcasts per Run</Label>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">Max podcasts to process per cron run (both passes)</p>
              </div>
              <NumberConfigInput
                value={getConfigValue("geoClassification.batchSize", 500) as number}
                onSave={(val) => updateConfig("geoClassification.batchSize", val)}
                saving={saving === "geoClassification.batchSize"}
              />
            </div>
          </div>

          {/* LLM Batch Size */}
          <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 mr-4">
                <Label className="text-xs text-[#F9FAFB]">Podcasts per LLM Call</Label>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">How many podcasts to classify in a single LLM request (reduces API calls)</p>
              </div>
              <NumberConfigInput
                value={getConfigValue("geoClassification.llmBatchSize", 10) as number}
                onSave={(val) => updateConfig("geoClassification.llmBatchSize", val)}
                saving={saving === "geoClassification.llmBatchSize"}
              />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
