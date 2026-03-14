import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Clock,
  Flag,
  Library,
  Mic,
  Sparkles,
  Volume2,
  Save,
  Plus,
  X,
  AlertTriangle,
  Settings,
  Zap,
  Play,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminFetch } from "@/lib/admin-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildPipelineConfig, STAGE_NAMES } from "@/hooks/use-pipeline-config";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry } from "@/types/admin";
import type {
  PlatformConfigEntry,
  DurationTier,
  FeatureFlag,
  PipelineConfig,
  PipelineTriggerResult,
} from "@/types/admin";

// ── Types ──

type CategoryId = "pipeline-controls" | "ai-models" | "duration-tiers" | "feature-flags" | "catalog-episodes";

interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: React.ElementType;
  color: string;
}

// ── Constants ──

const CATEGORIES: CategoryDef[] = [
  { id: "pipeline-controls", label: "Pipeline Controls", icon: Zap, color: "#EF4444" },
  { id: "ai-models", label: "AI Models", icon: Brain, color: "#8B5CF6" },
  { id: "duration-tiers", label: "Duration Tiers", icon: Clock, color: "#3B82F6" },
  { id: "feature-flags", label: "Feature Flags", icon: Flag, color: "#F97316" },
  { id: "catalog-episodes", label: "Catalog & Episodes", icon: Library, color: "#14B8A6" },
];

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "360", label: "6 hours" },
  { value: "720", label: "12 hours" },
];

const MODEL_TYPES = [
  { key: "stt" as AIStage, label: STAGE_LABELS.stt, icon: Mic, color: "#3B82F6" },
  { key: "distillation" as AIStage, label: STAGE_LABELS.distillation, icon: Sparkles, color: "#8B5CF6" },
  { key: "narrative" as AIStage, label: STAGE_LABELS.narrative, icon: Brain, color: "#F59E0B" },
  { key: "tts" as AIStage, label: STAGE_LABELS.tts, icon: Volume2, color: "#10B981" },
];

// ── Helpers ──

function formatCost(n: number | undefined): string {
  if (n == null) return "-";
  return `$${n.toFixed(2)}`;
}

// ── Loading Skeleton ──

function ConfigSkeleton() {
  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      <div className="w-60 shrink-0">
        <Skeleton className="h-full bg-white/5 rounded-lg" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-full bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

function relativeTime(iso: string | null | undefined): string {
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

// ── Pipeline Controls Panel ──

function PipelineControlsPanel({
  configs,
  apiFetch,
  onReload,
}: {
  configs: PlatformConfigEntry[];
  apiFetch: ReturnType<typeof useAdminFetch>;
  onReload: () => void;
}) {
  const pipelineConfig = buildPipelineConfig(configs);
  const [saving, setSaving] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const updateConfig = useCallback(
    async (key: string, value: unknown) => {
      setSaving(key);
      try {
        await apiFetch(`/config/${key}`, {
          method: "PATCH",
          body: JSON.stringify({ value }),
        });
        onReload();
      } catch (e) {
        console.error("Failed to update config:", e);
      } finally {
        setSaving(null);
      }
    },
    [apiFetch, onReload]
  );

  const handleRunNow = useCallback(async () => {
    setTriggering(true);
    try {
      await apiFetch<PipelineTriggerResult>("/pipeline/trigger/feed-refresh", { method: "POST" });
    } catch (e) {
      console.error("Failed to trigger pipeline:", e);
    } finally {
      setTriggering(false);
    }
  }, [apiFetch]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#F9FAFB]">Pipeline Controls</h3>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">Master pipeline settings and manual triggers</p>
      </div>

      {/* Master toggle + interval */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#EF4444]/10">
              <Zap className="h-4 w-4 text-[#EF4444]" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#F9FAFB]">Pipeline Enabled</span>
              <div className="text-[10px] text-[#9CA3AF]">Master switch for automated processing</div>
            </div>
          </div>
          <Switch
            checked={pipelineConfig.enabled}
            onCheckedChange={(v) => updateConfig("pipeline.enabled", v)}
            disabled={saving === "pipeline.enabled"}
            className="data-[state=checked]:bg-[#10B981]"
          />
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Auto-run Interval</Label>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Minimum time between scheduled runs</div>
          </div>
          <Select
            value={String(pipelineConfig.minIntervalMinutes)}
            onValueChange={(v) => updateConfig("pipeline.minIntervalMinutes", Number(v))}
            disabled={saving === "pipeline.minIntervalMinutes"}
          >
            <SelectTrigger className="w-36 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9CA3AF]">Last Auto-run</span>
          <span className="font-mono tabular-nums text-[#F9FAFB]">{relativeTime(pipelineConfig.lastAutoRunAt)}</span>
        </div>
      </div>

      {/* Per-stage toggles */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-3">
        <div>
          <span className="text-xs font-semibold text-[#F9FAFB]">Stage Toggles</span>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Enable or disable individual pipeline stages</p>
        </div>

        {Object.entries(STAGE_NAMES).map(([key, name], idx) => {
          const stageConfig = pipelineConfig.stages[key];
          const configKey = `pipeline.stage.${key}.enabled`;
          return (
            <div key={key} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
                >
                  {idx + 1}
                </span>
                <span className="text-xs text-[#F9FAFB]">{stageConfig?.name ?? name}</span>
              </div>
              <Switch
                checked={stageConfig?.enabled ?? true}
                onCheckedChange={(v) => updateConfig(configKey, v)}
                disabled={saving === configKey}
                className="data-[state=checked]:bg-[#3B82F6]"
              />
            </div>
          );
        })}
      </div>

      {/* Max Episodes per Podcast */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Max Episodes per Podcast</Label>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
              Limit how many episodes are ingested per podcast during feed refresh
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={50}
            value={
              (() => {
                const entry = configs.find((c) => c.key === "pipeline.feedRefresh.maxEpisodesPerPodcast");
                return entry?.value != null ? Number(entry.value) : 5;
              })()
            }
            onChange={(e) => {
              const val = Math.min(50, Math.max(1, Number(e.target.value)));
              updateConfig("pipeline.feedRefresh.maxEpisodesPerPodcast", val);
            }}
            disabled={saving === "pipeline.feedRefresh.maxEpisodesPerPodcast"}
            className="w-20 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
          />
        </div>
      </div>

      {/* Log Level */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Pipeline Log Level</Label>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
              Controls verbosity of pipeline console output
            </p>
          </div>
          <Select
            value={
              (() => {
                const entry = configs.find((c) => c.key === "pipeline.logLevel");
                return (entry?.value as string) ?? "info";
              })()
            }
            onValueChange={(v) => updateConfig("pipeline.logLevel", v)}
            disabled={saving === "pipeline.logLevel"}
          >
            <SelectTrigger className="w-28 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectItem value="error" className="text-xs">Error</SelectItem>
              <SelectItem value="info" className="text-xs">Info</SelectItem>
              <SelectItem value="debug" className="text-xs">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Manual Run */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#F9FAFB]">Manual Run</span>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Trigger a feed refresh cycle now</p>
          </div>
          <Button
            size="sm"
            onClick={handleRunNow}
            disabled={triggering}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {triggering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {triggering ? "Running..." : "Run Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── AI Models Panel ──

function AIModelsPanel({
  configs,
  apiFetch,
  onReload,
}: {
  configs: PlatformConfigEntry[];
  apiFetch: ReturnType<typeof useAdminFetch>;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [modelRegistry, setModelRegistry] = useState<AiModelEntry[]>([]);

  useEffect(() => {
    apiFetch("/ai-models").then((res: any) => setModelRegistry(res.data ?? []));
  }, []);

  function getStageModels(stage: string) {
    return modelRegistry
      .filter((m) => m.stage === stage)
      .flatMap((m) =>
        m.providers.length > 0
          ? m.providers.map((p) => ({
              provider: p.provider,
              providerLabel: p.providerLabel,
              model: m.modelId,
              label: m.label,
            }))
          : [{ provider: m.developer, providerLabel: m.developer, model: m.modelId, label: m.label }]
      );
  }

  function getModelConfig(prefix: string): { provider: string; model: string } | null {
    const entry = configs.find((c) => c.key === `ai.${prefix}.model`);
    const val = entry?.value as { provider?: string; model?: string } | null;
    if (!val?.provider || !val?.model) return null;
    return { provider: val.provider, model: val.model };
  }

  function getStageWarning(stageKey: string): string | null {
    const cfg = getModelConfig(stageKey);
    if (!cfg) return "No model configured — this stage will fail at runtime";
    const entries = getStageModels(stageKey);
    const exists = entries.some((m) => m.model === cfg.model && m.provider === cfg.provider);
    if (!exists) return `Configured model "${cfg.model}" from "${cfg.provider}" not found in registry`;
    return null;
  }

  function getModelLabel(stageKey: string, modelId: string, provider: string): string {
    const entries = getStageModels(stageKey);
    if (!entries) return modelId;
    const found = entries.find((m) => m.model === modelId && m.provider === provider);
    return found ? `${found.label} (${found.providerLabel})` : modelId;
  }

  const handleModelChange = async (stageKey: string, compositeKey: string) => {
    const [provider, ...rest] = compositeKey.split("::");
    const modelId = rest.join("::");
    setSaving(stageKey);
    try {
      await apiFetch(`/config/ai.${stageKey}.model`, {
        method: "PATCH",
        body: JSON.stringify({ value: { provider, model: modelId } }),
      });
      onReload();
      setEditing(null);
    } catch (e) {
      console.error("Failed to update model:", e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#F9FAFB]">AI Model Configuration</h3>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Configure the AI models used across pipeline stages</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MODEL_TYPES.map((mt) => {
          const cfg = getModelConfig(mt.key);
          const warning = modelRegistry.length > 0 ? getStageWarning(mt.key) : null;
          const Icon = mt.icon;
          const isEditing = editing === mt.key;
          const isSaving = saving === mt.key;
          const stageModels = getStageModels(mt.key);
          return (
            <div
              key={mt.key}
              className={cn(
                "bg-[#0F1D32] border rounded-lg p-4 transition-colors",
                warning ? "border-amber-500/40" : "border-white/5 hover:border-white/10"
              )}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="flex items-center justify-center h-8 w-8 rounded-lg"
                  style={{ backgroundColor: `${mt.color}15` }}
                >
                  <Icon className="h-4 w-4" style={{ color: mt.color }} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#F9FAFB]">{mt.label}</span>
                  <div className="text-[10px] text-[#9CA3AF]">{mt.key.toUpperCase()}</div>
                </div>
              </div>

              {warning && (
                <div className="flex items-start gap-1.5 mb-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-amber-300 leading-tight">{warning}</span>
                </div>
              )}

              {cfg ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9CA3AF]">Provider</span>
                    <span className="font-medium text-[#F9FAFB]">{cfg.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9CA3AF]">Model</span>
                    <span className="font-mono text-[10px] text-[#F9FAFB]">
                      {getModelLabel(mt.key, cfg.model, cfg.provider)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#9CA3AF] italic">Not configured</div>
              )}

              {isEditing ? (
                <div className="flex items-center gap-1.5 mt-3">
                  <Select
                    value={cfg ? `${cfg.provider}::${cfg.model}` : undefined}
                    onValueChange={(v) => handleModelChange(mt.key, v)}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      <SelectValue placeholder="Select a model..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      {stageModels.map((m) => (
                        <SelectItem
                          key={`${m.provider}::${m.model}`}
                          value={`${m.provider}::${m.model}`}
                          className="text-xs"
                        >
                          {m.label} ({m.providerLabel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditing(null)}
                    disabled={isSaving}
                    className="text-[#9CA3AF] hover:text-[#F9FAFB] shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(mt.key)}
                  className={cn(
                    "w-full mt-3 text-xs",
                    warning
                      ? "border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/10"
                      : "border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
                  )}
                >
                  <Settings className="h-3 w-3" />
                  {cfg ? "Change" : "Configure"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Duration Tiers Panel ──

function DurationTiersPanel({
  tiers,
  setDirty,
}: {
  tiers: DurationTier[];
  setDirty: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#F9FAFB]">Duration Tiers</h3>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Configure available briefing duration options</p>
        </div>
        <Button size="sm" className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5">
          <Plus className="h-3 w-3" />
          Add Tier
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {tiers.map((tier) => {
          const cacheColor = tier.cacheHitRate > 70 ? "#10B981" : tier.cacheHitRate > 40 ? "#F59E0B" : "#EF4444";
          return (
            <div
              key={tier.minutes}
              className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Duration display */}
                <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-[#3B82F6]/10 shrink-0">
                  <span className="text-lg font-bold font-mono tabular-nums text-[#3B82F6]">{tier.minutes}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#F9FAFB]">{tier.minutes} minute{tier.minutes !== 1 ? "s" : ""}</span>
                    <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
                      {tier.usageFrequency}% usage
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-[10px]">
                    <div>
                      <span className="text-[#9CA3AF]">Clips Generated</span>
                      <div className="text-xs font-mono tabular-nums text-[#F9FAFB] mt-0.5">
                        {tier.clipsGenerated.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF]">Storage Cost</span>
                      <div className="text-xs font-mono tabular-nums text-[#F9FAFB] mt-0.5">
                        {formatCost(tier.storageCost)}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF]">Cache Hit Rate</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${tier.cacheHitRate}%`, backgroundColor: cacheColor }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-[10px]" style={{ color: cacheColor }}>
                          {tier.cacheHitRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {tiers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
            <Clock className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No duration tiers configured</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feature Flags Panel ──

function FeatureFlagsPanel({
  flags,
  setDirty,
}: {
  flags: FeatureFlag[];
  setDirty: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#F9FAFB]">Feature Flags</h3>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Control feature rollout and availability</p>
        </div>
        <Button size="sm" className="bg-[#F97316] hover:bg-[#F97316]/80 text-white text-xs gap-1.5">
          <Plus className="h-3 w-3" />
          Add Flag
        </Button>
      </div>

      <div className="space-y-1">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_100px_50px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF]">
          <span>Flag</span>
          <span>Status</span>
          <span>Rollout</span>
          <span className="text-right">Toggle</span>
        </div>

        <div className="space-y-1">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="grid grid-cols-[1fr_80px_100px_50px] gap-3 items-center bg-[#0F1D32] border border-white/5 rounded-lg px-3 py-3 hover:border-white/10 transition-colors"
            >
              {/* Name + description */}
              <div className="min-w-0">
                <span className="text-xs font-medium text-[#F9FAFB] block truncate">{flag.name}</span>
                {flag.description && (
                  <span className="text-[10px] text-[#9CA3AF] block truncate mt-0.5">{flag.description}</span>
                )}
              </div>

              {/* Status */}
              <div>
                <Badge
                  className={cn(
                    "text-[10px]",
                    flag.enabled
                      ? "bg-[#10B981]/15 text-[#10B981]"
                      : "bg-white/5 text-[#9CA3AF]"
                  )}
                >
                  {flag.enabled ? "ON" : "OFF"}
                </Badge>
              </div>

              {/* Rollout percentage */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${flag.rolloutPercentage}%`,
                      backgroundColor: flag.enabled ? "#F97316" : "#9CA3AF",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-[#9CA3AF] w-8 text-right">
                  {flag.rolloutPercentage}%
                </span>
              </div>

              {/* Toggle */}
              <div className="flex justify-end">
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => setDirty(true)}
                  className="data-[state=checked]:bg-[#F97316]"
                />
              </div>
            </div>
          ))}
        </div>

        {flags.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
            <Flag className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No feature flags configured</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Catalog & Episodes Panel ──

interface CatalogConfigDef {
  key: string;
  label: string;
  type: "number" | "boolean";
  description: string;
  default: number | boolean;
}

const CATALOG_CONFIGS: CatalogConfigDef[] = [
  { key: "catalog.seedSize", label: "Catalog Seed Size", type: "number", description: "Podcasts to fetch during catalog-refresh", default: 200 },
  { key: "catalog.refreshAllPodcasts", label: "Refresh All Podcasts", type: "boolean", description: "Refresh all catalog podcasts (not just subscribed)", default: false },
  { key: "catalog.requests.enabled", label: "User Requests Enabled", type: "boolean", description: "Allow users to request new podcasts", default: true },
  { key: "catalog.requests.maxPerUser", label: "Max Requests Per User", type: "number", description: "Maximum pending requests per user", default: 5 },
  { key: "catalog.cleanup.inactivityThresholdDays", label: "Cleanup Inactivity Threshold", type: "number", description: "Days inactive before suggesting removal", default: 90 },
  { key: "episodes.aging.enabled", label: "Episode Aging Enabled", type: "boolean", description: "Enable episode aging deletion", default: false },
  { key: "episodes.aging.maxAgeDays", label: "Episode Max Age", type: "number", description: "Days before episodes are deletion candidates", default: 180 },
  { key: "BRIEFING_ASSEMBLY_AUDIO_ENABLED", label: "Audio Assembly", type: "boolean", description: "Enable jingle assembly in briefings", default: false },
];

function CatalogEpisodesPanel({
  configs,
  apiFetch,
  onReload,
}: {
  configs: PlatformConfigEntry[];
  apiFetch: ReturnType<typeof useAdminFetch>;
  onReload: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const updateConfig = useCallback(
    async (key: string, value: unknown) => {
      setSaving(key);
      try {
        await apiFetch(`/config/${key}`, {
          method: "PATCH",
          body: JSON.stringify({ value }),
        });
        onReload();
      } catch (e) {
        console.error("Failed to update config:", e);
      } finally {
        setSaving(null);
      }
    },
    [apiFetch, onReload]
  );

  function getConfigValue(key: string, defaultValue: number | boolean): number | boolean {
    const entry = configs.find((c) => c.key === key);
    if (entry?.value == null) return defaultValue;
    if (typeof defaultValue === "boolean") return entry.value === true || entry.value === "true";
    return Number(entry.value);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#F9FAFB]">Catalog & Episodes</h3>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">Catalog refresh, user requests, and episode lifecycle settings</p>
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
      </div>
    </div>
  );
}

// ── Main ──

export default function Configuration() {
  const apiFetch = useAdminFetch();

  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("pipeline-controls");
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [durationTiers, setDurationTiers] = useState<DurationTier[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config")
        .then((r) => {
          const flat = r.data.flatMap((g) => g.entries);
          setConfigs(flat);
        })
        .catch(console.error),
      apiFetch<{ data: DurationTier[] }>("/config/tiers/duration")
        .then((r) => setDurationTiers(r.data))
        .catch(console.error),
      apiFetch<{ data: FeatureFlag[] }>("/config/features")
        .then((r) => setFeatureFlags(r.data))
        .catch(console.error),
    ]).finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // Save would go here via PATCH/PUT endpoints
    // For now, simulate save
    await new Promise((resolve) => setTimeout(resolve, 500));
    setDirty(false);
    setSaving(false);
  }, []);

  if (loading && configs.length === 0) return <ConfigSkeleton />;

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4 relative">
      {/* Left Sidebar */}
      <div className="w-60 shrink-0 bg-[#1A2942] border border-white/5 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <span className="text-sm font-semibold text-[#F9FAFB]">Configuration</span>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Platform settings</p>
        </div>

        <nav className="p-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors",
                  isActive
                    ? "bg-white/5 text-[#F9FAFB] border-l-2"
                    : "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/[0.03] border-l-2 border-transparent"
                )}
                style={isActive ? { borderLeftColor: cat.color } : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: cat.color }} />
                {cat.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1">
          <div className="pr-2 pb-16">
            {selectedCategory === "pipeline-controls" && (
              <PipelineControlsPanel configs={configs} apiFetch={apiFetch} onReload={load} />
            )}
            {selectedCategory === "ai-models" && (
              <AIModelsPanel configs={configs} apiFetch={apiFetch} onReload={load} />
            )}
            {selectedCategory === "duration-tiers" && (
              <DurationTiersPanel tiers={durationTiers} setDirty={setDirty} />
            )}
            {selectedCategory === "feature-flags" && (
              <FeatureFlagsPanel flags={featureFlags} setDirty={setDirty} />
            )}
            {selectedCategory === "catalog-episodes" && (
              <CatalogEpisodesPanel configs={configs} apiFetch={apiFetch} onReload={load} />
            )}
          </div>
        </ScrollArea>

        {/* Sticky save bar */}
        {dirty && (
          <div className="absolute bottom-0 left-60 right-0 ml-4 bg-[#1A2942] border border-white/5 rounded-t-lg p-3 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-xs text-[#F59E0B] font-medium">You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDirty(false);
                  load();
                }}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs"
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
              >
                <Save className="h-3 w-3" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
