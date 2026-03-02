import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Clock,
  CreditCard,
  Flag,
  Mic,
  Sparkles,
  Volume2,
  Scissors,
  Save,
  Plus,
  Check,
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
import type {
  PlatformConfigEntry,
  DurationTier,
  SubscriptionTierConfig,
  FeatureFlag,
  UserTier,
  PipelineConfig,
  PipelineTriggerResult,
} from "@/types/admin";

// ── Types ──

type CategoryId = "pipeline-controls" | "ai-models" | "duration-tiers" | "subscription-tiers" | "feature-flags";

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
  { id: "subscription-tiers", label: "Subscription Tiers", icon: CreditCard, color: "#10B981" },
  { id: "feature-flags", label: "Feature Flags", icon: Flag, color: "#F97316" },
];

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Distillation",
  3: "Clip Generation",
  4: "Briefing Assembly",
};

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "360", label: "6 hours" },
  { value: "720", label: "12 hours" },
];

const MODEL_TYPES = [
  { key: "stt", label: "Speech-to-Text", icon: Mic, color: "#3B82F6" },
  { key: "distillation", label: "Distillation", icon: Sparkles, color: "#8B5CF6" },
  { key: "narrative", label: "Narrative", icon: Brain, color: "#F59E0B" },
  { key: "tts", label: "Text-to-Speech", icon: Volume2, color: "#10B981" },
];

const TIER_COLORS: Record<string, string> = {
  FREE: "#9CA3AF",
  PRO: "#3B82F6",
  PRO_PLUS: "#8B5CF6",
};

// ── Helpers ──

function formatCost(n: number | undefined): string {
  if (n == null) return "-";
  return `$${n.toFixed(2)}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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

// ── Helpers (pipeline) ──

function buildPipelineConfig(configs: PlatformConfigEntry[]): PipelineConfig {
  const get = (key: string) => configs.find((c) => c.key === key)?.value;
  return {
    enabled: get("pipeline.enabled") === true || get("pipeline.enabled") === "true",
    minIntervalMinutes: Number(get("pipeline.minIntervalMinutes")) || 60,
    lastAutoRunAt: (get("pipeline.lastAutoRunAt") as string) ?? null,
    stages: {
      1: { enabled: get("pipeline.stage.1.enabled") !== false && get("pipeline.stage.1.enabled") !== "false", name: STAGE_NAMES[1] },
      2: { enabled: get("pipeline.stage.2.enabled") !== false && get("pipeline.stage.2.enabled") !== "false", name: STAGE_NAMES[2] },
      3: { enabled: get("pipeline.stage.3.enabled") !== false && get("pipeline.stage.3.enabled") !== "false", name: STAGE_NAMES[3] },
      4: { enabled: get("pipeline.stage.4.enabled") !== false && get("pipeline.stage.4.enabled") !== "false", name: STAGE_NAMES[4] },
    },
  };
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

        {[1, 2, 3, 4].map((stage) => {
          const stageConfig = pipelineConfig.stages[stage];
          const configKey = `pipeline.stage.${stage}.enabled`;
          return (
            <div key={stage} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
                >
                  {stage}
                </span>
                <span className="text-xs text-[#F9FAFB]">{stageConfig?.name ?? `Stage ${stage}`}</span>
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

function AIModelsPanel({ configs }: { configs: PlatformConfigEntry[] }) {
  // Extract model configs from the flat config list
  function getModelConfig(prefix: string): { provider: string; model: string; costPer1k: string } {
    const providerEntry = configs.find((c) => c.key === `${prefix}.provider`);
    const modelEntry = configs.find((c) => c.key === `${prefix}.model`);
    const costEntry = configs.find((c) => c.key === `${prefix}.cost_per_1k`);
    return {
      provider: (providerEntry?.value as string) ?? "Unknown",
      model: (modelEntry?.value as string) ?? "Unknown",
      costPer1k: costEntry?.value != null ? `$${Number(costEntry.value).toFixed(4)}/1k` : "-",
    };
  }

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
          const Icon = mt.icon;
          return (
            <div
              key={mt.key}
              className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9CA3AF]">Provider</span>
                  <span className="font-medium text-[#F9FAFB]">{cfg.provider}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9CA3AF]">Model</span>
                  <span className="font-mono text-[10px] text-[#F9FAFB]">{cfg.model}</span>
                </div>
                <Separator className="bg-white/5" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9CA3AF]">Cost</span>
                  <span className="font-mono tabular-nums text-[#F59E0B] text-[10px]">{cfg.costPer1k}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 text-xs"
              >
                <Settings className="h-3 w-3" />
                Change
              </Button>
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

// ── Subscription Tiers Panel ──

function SubscriptionTiersPanel({
  tiers,
  setDirty,
}: {
  tiers: SubscriptionTierConfig[];
  setDirty: (v: boolean) => void;
}) {
  const [editingTier, setEditingTier] = useState<UserTier | null>(null);
  const [editPrice, setEditPrice] = useState("");

  function startEditing(tier: SubscriptionTierConfig) {
    setEditingTier(tier.tier);
    setEditPrice((tier.priceCents / 100).toFixed(2));
  }

  function cancelEditing() {
    setEditingTier(null);
    setEditPrice("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#F9FAFB]">Subscription Tiers</h3>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">Manage pricing, limits, and features for each plan</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {tiers.map((tier) => {
          const color = TIER_COLORS[tier.tier] ?? "#9CA3AF";
          const isEditing = editingTier === tier.tier;

          return (
            <div
              key={tier.tier}
              className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex items-center justify-center h-8 w-8 rounded-lg"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <CreditCard className="h-4 w-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#F9FAFB]">{tier.name}</span>
                      <Badge
                        className="text-[10px]"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        {tier.tier}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[#9CA3AF]">$</span>
                          <Input
                            value={editPrice}
                            onChange={(e) => {
                              setEditPrice(e.target.value);
                              setDirty(true);
                            }}
                            className="h-6 w-20 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono"
                          />
                          <span className="text-[10px] text-[#9CA3AF]">/mo</span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={cancelEditing}
                            className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(tier)}
                          className="text-sm font-mono tabular-nums text-[#F9FAFB] hover:text-[#3B82F6] transition-colors"
                        >
                          {formatCents(tier.priceCents)}/mo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge className="bg-white/5 text-[#9CA3AF] text-[10px]">
                    {tier.userCount.toLocaleString()} users
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-[#9CA3AF]">Active</Label>
                    <Switch
                      checked={tier.active}
                      onCheckedChange={() => setDirty(true)}
                      className="data-[state=checked]:bg-[#10B981]"
                    />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="rounded-md bg-[#1A2942] p-2">
                  <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider block mb-0.5">Price</span>
                  <span className="text-xs font-mono tabular-nums text-[#F9FAFB]">
                    {formatCents(tier.priceCents)}/mo
                  </span>
                </div>
                <div className="rounded-md bg-[#1A2942] p-2">
                  <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider block mb-0.5">Users</span>
                  <span className="text-xs font-mono tabular-nums text-[#F9FAFB]">
                    {tier.userCount.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-md bg-[#1A2942] p-2">
                  <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider block mb-0.5">Highlighted</span>
                  <span className="text-xs font-mono tabular-nums text-[#F9FAFB]">
                    {tier.highlighted ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div>
                <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1.5 block">Features</span>
                <div className="flex flex-wrap gap-1.5">
                  {tier.features.map((feature, i) => (
                    <Badge
                      key={i}
                      className="bg-white/5 text-[#F9FAFB]/80 text-[10px] font-normal"
                    >
                      <Check className="h-2.5 w-2.5 text-[#10B981] mr-0.5" />
                      {feature}
                    </Badge>
                  ))}
                  {tier.features.length === 0 && (
                    <span className="text-[10px] text-[#9CA3AF]">No features configured</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {tiers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
            <CreditCard className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No subscription tiers configured</span>
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
        <div className="grid grid-cols-[1fr_80px_100px_140px_50px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-[#9CA3AF]">
          <span>Flag</span>
          <span>Status</span>
          <span>Rollout</span>
          <span>Tiers</span>
          <span className="text-right">Toggle</span>
        </div>

        <div className="space-y-1">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="grid grid-cols-[1fr_80px_100px_140px_50px] gap-3 items-center bg-[#0F1D32] border border-white/5 rounded-lg px-3 py-3 hover:border-white/10 transition-colors"
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

              {/* Tier availability */}
              <div className="flex gap-1 flex-wrap">
                {flag.tierAvailability.map((tier) => (
                  <Badge
                    key={tier}
                    className="text-[9px] px-1.5"
                    style={{
                      backgroundColor: `${TIER_COLORS[tier] ?? "#9CA3AF"}15`,
                      color: TIER_COLORS[tier] ?? "#9CA3AF",
                    }}
                  >
                    {tier}
                  </Badge>
                ))}
                {flag.tierAvailability.length === 0 && (
                  <span className="text-[10px] text-[#9CA3AF]">All</span>
                )}
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

// ── Main ──

export default function Configuration() {
  const apiFetch = useAdminFetch();

  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("pipeline-controls");
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [durationTiers, setDurationTiers] = useState<DurationTier[]>([]);
  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTierConfig[]>([]);
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
      apiFetch<{ data: SubscriptionTierConfig[] }>("/config/tiers/subscription")
        .then((r) => setSubscriptionTiers(r.data))
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
              <AIModelsPanel configs={configs} />
            )}
            {selectedCategory === "duration-tiers" && (
              <DurationTiersPanel tiers={durationTiers} setDirty={setDirty} />
            )}
            {selectedCategory === "subscription-tiers" && (
              <SubscriptionTiersPanel tiers={subscriptionTiers} setDirty={setDirty} />
            )}
            {selectedCategory === "feature-flags" && (
              <FeatureFlagsPanel flags={featureFlags} setDirty={setDirty} />
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
