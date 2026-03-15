import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Mic,
  Sparkles,
  Volume2,
  Settings,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  const [editing, setEditing] = useState<string | null>(null);
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
      await load();
      setEditing(null);
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
        <p className="text-xs text-[#9CA3AF] mt-0.5">Configure the AI models used across pipeline stages</p>
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
