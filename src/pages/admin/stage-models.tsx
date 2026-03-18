import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Mic,
  Sparkles,
  Volume2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry, PlatformConfigEntry } from "@/types/admin";

const MODEL_TYPES = [
  { key: "stt" as AIStage, label: STAGE_LABELS.stt, icon: Mic, color: "#3B82F6" },
  { key: "distillation" as AIStage, label: STAGE_LABELS.distillation, icon: Sparkles, color: "#8B5CF6" },
  { key: "narrative" as AIStage, label: STAGE_LABELS.narrative, icon: Brain, color: "#F59E0B" },
  { key: "tts" as AIStage, label: STAGE_LABELS.tts, icon: Volume2, color: "#10B981" },
];

const TIERS = [
  { key: "primary", label: "Primary", configSuffix: "" },
  { key: "secondary", label: "Secondary", configSuffix: ".secondary" },
  { key: "tertiary", label: "Tertiary", configSuffix: ".tertiary" },
] as const;

function StageModelsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-56 bg-white/5" />
      <Skeleton className="h-4 w-80 bg-white/5" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function StageModels() {
  const apiFetch = useAdminFetch();
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [modelRegistry, setModelRegistry] = useState<AiModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, modelsRes] = await Promise.all([
        apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config"),
        apiFetch<{ data: AiModelEntry[] }>("/ai-models"),
      ]);
      setConfigs(configRes.data.flatMap((g) => g.entries));
      setModelRegistry(modelsRes.data ?? []);
    } catch (e) {
      console.error("Failed to load stage models config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

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

  function getConfigByKey(key: string): { provider: string; model: string } | null {
    const entry = configs.find((c) => c.key === key);
    const val = entry?.value as { provider?: string; model?: string } | null;
    if (!val?.provider || !val?.model) return null;
    return { provider: val.provider, model: val.model };
  }

  function getStageWarning(stageKey: string): string | null {
    const cfg = getConfigByKey(`ai.${stageKey}.model`);
    if (!cfg) return "No primary model configured — this stage will fail at runtime";
    const entries = getStageModels(stageKey);
    const exists = entries.some((m) => m.model === cfg.model && m.provider === cfg.provider);
    if (!exists) return `Primary model "${cfg.model}" from "${cfg.provider}" not found in registry`;
    return null;
  }

  const handleTierChange = async (configKey: string, compositeKey: string) => {
    if (compositeKey === "__none__") {
      setSaving(configKey);
      try {
        await apiFetch(`/config/${configKey}`, {
          method: "PATCH",
          body: JSON.stringify({ value: null }),
        });
        await load();
      } catch (e) {
        console.error("Failed to clear model:", e);
      } finally {
        setSaving(null);
      }
      return;
    }
    const [provider, ...rest] = compositeKey.split("::");
    const modelId = rest.join("::");
    setSaving(configKey);
    try {
      await apiFetch(`/config/${configKey}`, {
        method: "PATCH",
        body: JSON.stringify({ value: { provider, model: modelId } }),
      });
      await load();
    } catch (e) {
      console.error("Failed to update model:", e);
    } finally {
      setSaving(null);
    }
  };

  if (loading && configs.length === 0) return <StageModelsSkeleton />;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">AI Model Configuration</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">Configure primary, secondary, and tertiary models for each pipeline stage. Fallbacks are tried in order on failure.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MODEL_TYPES.map((mt) => {
          const warning = modelRegistry.length > 0 ? getStageWarning(mt.key) : null;
          const Icon = mt.icon;
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

              <div className="space-y-2">
                {TIERS.map((tier, tierIdx) => {
                  const configKey = `ai.${mt.key}.model${tier.configSuffix}`;
                  const tierCfg = getConfigByKey(configKey);
                  const tierSaving = saving === configKey;
                  const isPrimary = tier.key === "primary";
                  // Collect composite keys of higher-priority tiers to exclude from this dropdown
                  const selectedAbove = new Set(
                    TIERS.slice(0, tierIdx)
                      .map((t) => {
                        const cfg = getConfigByKey(`ai.${mt.key}.model${t.configSuffix}`);
                        return cfg ? `${cfg.provider}::${cfg.model}` : null;
                      })
                      .filter(Boolean) as string[]
                  );
                  const availableModels = stageModels.filter(
                    (m) => !selectedAbove.has(`${m.provider}::${m.model}`)
                  );
                  return (
                    <div key={tier.key} className="space-y-1">
                      <span className={cn(
                        "text-[10px] capitalize",
                        isPrimary ? "text-[#F9FAFB] font-medium" : "text-[#9CA3AF]"
                      )}>
                        {tier.label}
                      </span>
                      <Select
                        value={tierCfg ? `${tierCfg.provider}::${tierCfg.model}` : "__none__"}
                        onValueChange={(v) => handleTierChange(configKey, v)}
                        disabled={tierSaving}
                      >
                        <SelectTrigger className={cn(
                          "flex-1 bg-[#1A2942] border-white/10 text-[#F9FAFB]",
                          isPrimary ? "h-8 text-xs" : "h-7 text-[10px]"
                        )}>
                          <SelectValue placeholder={isPrimary ? "Select a model..." : "None (disabled)"} />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                          {!isPrimary && (
                            <SelectItem value="__none__" className="text-[10px] text-[#6B7280]">
                              None (disabled)
                            </SelectItem>
                          )}
                          {availableModels.map((m) => (
                            <SelectItem
                              key={`${m.provider}::${m.model}`}
                              value={`${m.provider}::${m.model}`}
                              className={isPrimary ? "text-xs" : "text-[10px]"}
                            >
                              {m.label} ({m.providerLabel})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
