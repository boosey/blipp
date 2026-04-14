import { useState, useEffect, useCallback } from "react";
import { Brain, Mic, Sparkles, Volume2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry, PlatformConfigEntry, PromptVersionEntry } from "@/types/admin";
import {
  StageHeader,
  ModelTierSelector,
  PromptSection,
} from "@/components/admin/stage-configuration";
import type { PromptEntry } from "@/components/admin/stage-configuration";

const STAGES: {
  key: AIStage;
  label: string;
  icon: React.ElementType;
  color: string;
  configStageKey: string;
  hasPrompts: boolean;
}[] = [
  { key: "stt", label: STAGE_LABELS.stt, icon: Mic, color: "#3B82F6", configStageKey: "TRANSCRIPTION", hasPrompts: false },
  { key: "distillation", label: STAGE_LABELS.distillation, icon: Sparkles, color: "#8B5CF6", configStageKey: "DISTILLATION", hasPrompts: true },
  { key: "narrative", label: STAGE_LABELS.narrative, icon: Brain, color: "#F59E0B", configStageKey: "NARRATIVE_GENERATION", hasPrompts: true },
  { key: "tts", label: STAGE_LABELS.tts, icon: Volume2, color: "#10B981", configStageKey: "AUDIO_GENERATION", hasPrompts: false },
];

const TIERS = [
  { key: "primary", label: "Primary", configSuffix: "" },
  { key: "secondary", label: "Secondary", configSuffix: ".secondary" },
  { key: "tertiary", label: "Tertiary", configSuffix: ".tertiary" },
] as const;

function StageConfigSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

export default function StageConfiguration() {
  const apiFetch = useAdminFetch();
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [modelRegistry, setModelRegistry] = useState<AiModelEntry[]>([]);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<AIStage | null>(null);
  const [stageVersions, setStageVersions] = useState<Record<string, PromptVersionEntry[]>>({});
  const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);
  const [stageChangeDescriptions, setStageChangeDescriptions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [configRes, modelsRes, promptsRes] = await Promise.all([
        apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config?owner=stage-configuration"),
        apiFetch<{ data: AiModelEntry[] }>("/ai-models"),
        apiFetch<{ data: PromptEntry[] }>("/prompts"),
      ]);
      setConfigs(configRes.data.flatMap((g) => g.entries));
      setModelRegistry(modelsRes.data ?? []);
      setPrompts(promptsRes.data ?? []);
      const values: Record<string, string> = {};
      for (const p of promptsRes.data ?? []) values[p.key] = p.value;
      setEditValues(values);
    } catch (e) {
      console.error("Failed to load stage configuration:", e);
      toast.error("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  function getConfigByKey(key: string): { provider: string; model: string } | null {
    const entry = configs.find((c) => c.key === key);
    const val = entry?.value as { provider?: string; model?: string } | null;
    if (!val?.provider || !val?.model) return null;
    return { provider: val.provider, model: val.model };
  }

  function isStageEnabled(configStageKey: string): boolean {
    const entry = configs.find((c) => c.key === `pipeline.stage.${configStageKey}.enabled`);
    return entry?.value !== false && entry?.value !== "false";
  }

  function getStageModels(stage: string) {
    return modelRegistry
      .filter((m) => m.stages.includes(stage))
      .flatMap((m) =>
        m.providers.length > 0
          ? m.providers.map((p) => ({
              provider: p.provider,
              providerLabel: p.providerLabel,
              providerModelId: p.providerModelId,
              model: m.modelId,
              label: m.label,
            }))
          : [{ provider: m.developer, providerLabel: m.developer, providerModelId: null, model: m.modelId, label: m.label }]
      );
  }

  function getStageWarning(stageKey: string): string | null {
    const cfg = getConfigByKey(`ai.${stageKey}.model`);
    if (!cfg) return "No primary model configured";
    const entries = getStageModels(stageKey);
    const exists = entries.some((m) => m.model === cfg.model && m.provider === cfg.provider);
    if (!exists) return `Primary model "${cfg.model}" not found in registry`;
    return null;
  }

  function getPrimaryModelLabel(stageKey: string): string {
    const cfg = getConfigByKey(`ai.${stageKey}.model`);
    if (!cfg) return "Not set";
    const entries = getStageModels(stageKey);
    const match = entries.find((m) => m.model === cfg.model && m.provider === cfg.provider);
    return match ? `${match.label} (${match.providerLabel})` : cfg.model;
  }

  const handleToggleStage = async (configStageKey: string, enabled: boolean) => {
    const configKey = `pipeline.stage.${configStageKey}.enabled`;
    setSaving(configKey);
    try {
      await apiFetch(`/config/${configKey}`, { method: "PATCH", body: JSON.stringify({ value: enabled }) });
      await load();
    } catch { toast.error("Failed to toggle stage"); }
    finally { setSaving(null); }
  };

  const handleTierChange = async (configKey: string, compositeKey: string) => {
    if (compositeKey === "__none__") {
      setSaving(configKey);
      try {
        await apiFetch(`/config/${configKey}`, { method: "PATCH", body: JSON.stringify({ value: null }) });
        await load();
      } catch { toast.error("Failed to clear model"); }
      finally { setSaving(null); }
      return;
    }
    const [provider, ...rest] = compositeKey.split("::");
    const modelId = rest.join("::");
    setSaving(configKey);
    try {
      await apiFetch(`/config/${configKey}`, { method: "PATCH", body: JSON.stringify({ value: { provider, model: modelId } }) });
      await load();
    } catch { toast.error("Failed to update model"); }
    finally { setSaving(null); }
  };

  const handleSaveStagePrompts = async (stageKey: string) => {
    const stagePrompts = prompts.filter((p) => p.stage === stageKey);
    const values: Record<string, string> = {};
    for (const p of stagePrompts) values[p.key] = editValues[p.key] ?? p.value;
    setSaving(`stage:${stageKey}`);
    try {
      await apiFetch(`/prompts/stages/${stageKey}`, {
        method: "POST",
        body: JSON.stringify({ values, label: stageChangeDescriptions[stageKey]?.trim() || undefined }),
      });
      setStageChangeDescriptions((prev) => ({ ...prev, [stageKey]: "" }));
      toast.success("Prompts saved as new version");
      await load();
      if (expandedVersions === stageKey) await loadStageVersions(stageKey);
    } catch { toast.error("Failed to save prompts"); }
    finally { setSaving(null); }
  };

  const loadStageVersions = useCallback(async (stageKey: string) => {
    try {
      const res = await apiFetch<{ data: PromptVersionEntry[] }>(`/prompts/stages/${stageKey}/versions`);
      setStageVersions((prev) => ({ ...prev, [stageKey]: res.data }));
    } catch { toast.error("Failed to load versions"); }
  }, [apiFetch]);

  const handleActivateVersion = async (stageKey: string, versionId: string) => {
    setSaving(`activate:${versionId}`);
    try {
      await apiFetch(`/prompts/stages/${stageKey}/versions/${versionId}/activate`, { method: "PATCH" });
      toast.success("Version activated");
      await load();
      await loadStageVersions(stageKey);
    } catch { toast.error("Failed to activate version"); }
    finally { setSaving(null); }
  };

  const handleSaveNotes = async (stageKey: string, versionId: string) => {
    setSavingNotes(versionId);
    try {
      await apiFetch(`/prompts/stages/${stageKey}/versions/${versionId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes: editingNotes[versionId] ?? "" }),
      });
      toast.success("Notes saved");
      await loadStageVersions(stageKey);
    } catch { toast.error("Failed to save notes"); }
    finally { setSavingNotes(null); }
  };

  const toggleVersionHistory = (stageKey: string) => {
    if (expandedVersions === stageKey) {
      setExpandedVersions(null);
    } else {
      setExpandedVersions(stageKey);
      loadStageVersions(stageKey);
    }
  };

  if (loading && configs.length === 0) return <StageConfigSkeleton />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#F9FAFB]">Stage Configuration</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Configure models, prompts, and enable/disable each pipeline stage. Fallbacks are tried in order on failure.
        </p>
      </div>

      <div className="space-y-3">
        {STAGES.map((stage) => {
          const expanded = expandedStage === stage.key;
          const enabled = isStageEnabled(stage.configStageKey);
          const warning = modelRegistry.length > 0 ? getStageWarning(stage.key) : null;
          const primaryLabel = getPrimaryModelLabel(stage.key);
          const stageModels = getStageModels(stage.key);
          const stagePrompts = prompts.filter((p) => p.stage === stage.key);
          const stageDirty = stagePrompts.some((p) => editValues[p.key] !== p.value);
          const stageSaving = saving === `stage:${stage.key}`;

          return (
            <div
              key={stage.key}
              className={cn(
                "bg-[#0F1D32] border rounded-lg transition-colors",
                warning ? "border-amber-500/40" : "border-white/5"
              )}
            >
              <StageHeader
                label={stage.label}
                icon={stage.icon}
                color={stage.color}
                enabled={enabled}
                expanded={expanded}
                warning={warning}
                primaryLabel={primaryLabel}
                saving={saving === `pipeline.stage.${stage.configStageKey}.enabled`}
                onToggle={(v) => handleToggleStage(stage.configStageKey, v)}
                onExpand={() => setExpandedStage(expanded ? null : stage.key)}
              />

              {expanded && (
                <div className="px-4 pb-4 space-y-4">
                  {warning && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-300 leading-tight">{warning}</span>
                    </div>
                  )}

                  <ModelTierSelector
                    stageKey={stage.key}
                    tiers={TIERS}
                    stageModels={stageModels}
                    getConfigByKey={getConfigByKey}
                    saving={saving}
                    onTierChange={handleTierChange}
                  />

                  {stage.hasPrompts && stagePrompts.length > 0 && (
                    <PromptSection
                      stageKey={stage.key}
                      stagePrompts={stagePrompts}
                      editValues={editValues}
                      onEditValueChange={(key, value) =>
                        setEditValues((prev) => ({ ...prev, [key]: value }))
                      }
                      stageDirty={stageDirty}
                      stageSaving={stageSaving}
                      changeDescription={stageChangeDescriptions[stage.key] ?? ""}
                      onChangeDescriptionUpdate={(value) =>
                        setStageChangeDescriptions((prev) => ({ ...prev, [stage.key]: value }))
                      }
                      onSave={() => handleSaveStagePrompts(stage.key)}
                      expandedVersions={expandedVersions === stage.key}
                      onToggleVersionHistory={() => toggleVersionHistory(stage.key)}
                      versions={stageVersions[stage.key] ?? []}
                      saving={saving}
                      onActivateVersion={(versionId) => handleActivateVersion(stage.key, versionId)}
                      onLoadVersion={(values) =>
                        setEditValues((prev) => ({ ...prev, ...values }))
                      }
                      editingNotes={editingNotes}
                      onEditNote={(versionId, value) =>
                        setEditingNotes((prev) => ({ ...prev, [versionId]: value }))
                      }
                      savingNotes={savingNotes}
                      onSaveNotes={(versionId) => handleSaveNotes(stage.key, versionId)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
