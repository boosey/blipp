import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Mic,
  Sparkles,
  Volume2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  History,
  Play,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
import type { AiModelEntry, PlatformConfigEntry, PromptVersionEntry } from "@/types/admin";

interface PromptEntry {
  key: string;
  label: string;
  description: string;
  stage: string;
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

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
  const [versions, setVersions] = useState<Record<string, PromptVersionEntry[]>>({});
  const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [configRes, modelsRes, promptsRes] = await Promise.all([
        apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config"),
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

  // --- Config helpers ---

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

  // --- Handlers ---

  const handleToggleStage = async (configStageKey: string, enabled: boolean) => {
    const configKey = `pipeline.stage.${configStageKey}.enabled`;
    setSaving(configKey);
    try {
      await apiFetch(`/config/${configKey}`, {
        method: "PATCH",
        body: JSON.stringify({ value: enabled }),
      });
      await load();
    } catch {
      toast.error("Failed to toggle stage");
    } finally {
      setSaving(null);
    }
  };

  const handleTierChange = async (configKey: string, compositeKey: string) => {
    if (compositeKey === "__none__") {
      setSaving(configKey);
      try {
        await apiFetch(`/config/${configKey}`, {
          method: "PATCH",
          body: JSON.stringify({ value: null }),
        });
        await load();
      } catch {
        toast.error("Failed to clear model");
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
    } catch {
      toast.error("Failed to update model");
    } finally {
      setSaving(null);
    }
  };

  const handleSavePrompt = async (key: string) => {
    setSaving(`prompt:${key}`);
    try {
      await apiFetch(`/prompts/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValues[key] }),
      });
      toast.success("Prompt saved as new version");
      await load();
      if (expandedVersions === key) await loadVersions(key);
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSaving(null);
    }
  };

  const handleResetPrompt = async (key: string) => {
    setSaving(`prompt:${key}`);
    try {
      const res = await apiFetch<{ data: { value: string } }>(`/prompts/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      toast.success("Reset to default");
      setEditValues((prev) => ({ ...prev, [key]: res.data.value }));
      await load();
    } catch {
      toast.error("Failed to reset prompt");
    } finally {
      setSaving(null);
    }
  };

  const isPromptDirty = (key: string) => {
    const original = prompts.find((p) => p.key === key);
    return original && editValues[key] !== original.value;
  };

  const loadVersions = useCallback(async (promptKey: string) => {
    try {
      const res = await apiFetch<{ data: PromptVersionEntry[] }>(
        `/prompts/${encodeURIComponent(promptKey)}/versions`
      );
      setVersions((prev) => ({ ...prev, [promptKey]: res.data }));
    } catch {
      toast.error("Failed to load versions");
    }
  }, [apiFetch]);

  const handleActivateVersion = async (promptKey: string, versionId: string) => {
    setSaving(`activate:${versionId}`);
    try {
      await apiFetch(
        `/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/activate`,
        { method: "PATCH" }
      );
      toast.success("Version activated");
      await load();
      await loadVersions(promptKey);
    } catch {
      toast.error("Failed to activate version");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveNotes = async (promptKey: string, versionId: string) => {
    setSavingNotes(versionId);
    try {
      await apiFetch(
        `/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/notes`,
        {
          method: "PATCH",
          body: JSON.stringify({ notes: editingNotes[versionId] ?? "" }),
        }
      );
      toast.success("Notes saved");
      await loadVersions(promptKey);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(null);
    }
  };

  const toggleVersionHistory = (promptKey: string) => {
    if (expandedVersions === promptKey) {
      setExpandedVersions(null);
    } else {
      setExpandedVersions(promptKey);
      loadVersions(promptKey);
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
          const Icon = stage.icon;
          const expanded = expandedStage === stage.key;
          const enabled = isStageEnabled(stage.configStageKey);
          const warning = modelRegistry.length > 0 ? getStageWarning(stage.key) : null;
          const primaryLabel = getPrimaryModelLabel(stage.key);
          const stageModels = getStageModels(stage.key);
          const stagePrompts = prompts.filter((p) => p.stage === stage.key);

          return (
            <div
              key={stage.key}
              className={cn(
                "bg-[#0F1D32] border rounded-lg transition-colors",
                warning ? "border-amber-500/40" : "border-white/5"
              )}
            >
              {/* Header — always visible */}
              <button
                onClick={() => setExpandedStage(expanded ? null : stage.key)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                    style={{ backgroundColor: `${stage.color}15` }}
                  >
                    <Icon className="h-4.5 w-4.5" style={{ color: stage.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#F9FAFB]">{stage.label}</span>
                      {!enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          disabled
                        </span>
                      )}
                      {warning && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-[#9CA3AF]">{primaryLabel}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === " ") e.stopPropagation(); }}
                  >
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => handleToggleStage(stage.configStageKey, v)}
                      disabled={saving === `pipeline.stage.${stage.configStageKey}.enabled`}
                      className="data-[state=checked]:bg-[#10B981]"
                    />
                  </div>
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Warning */}
                  {warning && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-300 leading-tight">{warning}</span>
                    </div>
                  )}

                  {/* Models section */}
                  <div className="bg-[#1A2942] rounded-lg p-4 space-y-3">
                    <span className="text-xs font-semibold text-[#F9FAFB]">Models</span>
                    <div className="space-y-2">
                      {TIERS.map((tier, tierIdx) => {
                        const configKey = `ai.${stage.key}.model${tier.configSuffix}`;
                        const tierCfg = getConfigByKey(configKey);
                        const tierSaving = saving === configKey;
                        const isPrimary = tier.key === "primary";
                        const selectedAbove = new Set(
                          TIERS.slice(0, tierIdx)
                            .map((t) => {
                              const cfg = getConfigByKey(`ai.${stage.key}.model${t.configSuffix}`);
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
                                "bg-[#0F1D32] border-white/10 text-[#F9FAFB]",
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

                  {/* Prompts section — only for stages that have prompts */}
                  {stage.hasPrompts && stagePrompts.length > 0 && (
                    <div className="bg-[#1A2942] rounded-lg p-4 space-y-3">
                      <span className="text-xs font-semibold text-[#F9FAFB]">Prompts</span>
                      {stagePrompts.map((prompt) => {
                        const dirty = isPromptDirty(prompt.key);
                        const isSaving = saving === `prompt:${prompt.key}`;
                        return (
                          <div key={prompt.key} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#F9FAFB]">{prompt.label}</span>
                              {!prompt.isDefault && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B]">
                                  customized
                                </span>
                              )}
                              {dirty && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3B82F6]/20 text-[#3B82F6]">
                                  unsaved
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#9CA3AF]">{prompt.description}</p>
                            <textarea
                              value={editValues[prompt.key] ?? ""}
                              onChange={(e) =>
                                setEditValues((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                              }
                              className="w-full h-48 bg-[#0F1D32] border border-white/10 rounded-lg p-3 text-xs font-mono text-[#E5E7EB] placeholder:text-[#6B7280] resize-y focus:outline-none focus:border-[#3B82F6]"
                              spellCheck={false}
                            />
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] text-[#6B7280]">
                                {prompt.updatedAt
                                  ? `Last updated: ${new Date(prompt.updatedAt).toLocaleString()}`
                                  : "Using default"}
                              </div>
                              <div className="flex items-center gap-2">
                                {!prompt.isDefault && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResetPrompt(prompt.key)}
                                    disabled={isSaving}
                                    className="h-7 text-xs text-[#F59E0B] hover:bg-[#F59E0B]/10 gap-1"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset to Default
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  onClick={() => handleSavePrompt(prompt.key)}
                                  disabled={isSaving || !dirty}
                                  className="h-7 text-xs bg-[#3B82F6] hover:bg-[#2563EB] text-white gap-1"
                                >
                                  <Save className="h-3 w-3" />
                                  {isSaving ? "Saving..." : "Save"}
                                </Button>
                              </div>
                            </div>

                            {/* Version History */}
                            <div className="border-t border-white/5 pt-2 mt-2">
                              <button
                                onClick={() => toggleVersionHistory(prompt.key)}
                                className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors"
                              >
                                <History className="h-3 w-3" />
                                Version History
                                {expandedVersions === prompt.key ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>

                              {expandedVersions === prompt.key && (
                                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                                  {(versions[prompt.key] ?? []).length === 0 ? (
                                    <p className="text-[10px] text-[#6B7280] italic">No versions saved yet</p>
                                  ) : (
                                    (versions[prompt.key] ?? []).map((v) => (
                                      <div
                                        key={v.id}
                                        className={cn(
                                          "rounded-lg border p-2.5 space-y-1.5",
                                          v.isActive
                                            ? "bg-[#10B981]/5 border-[#10B981]/30"
                                            : "bg-[#0F1D32] border-white/5"
                                        )}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono font-semibold text-[#F9FAFB]">
                                              v{v.version}
                                            </span>
                                            {v.label && (
                                              <span className="text-[10px] text-[#9CA3AF]">{v.label}</span>
                                            )}
                                            {v.isActive && (
                                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                                                active
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {!v.isActive && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleActivateVersion(prompt.key, v.id)}
                                                disabled={saving === `activate:${v.id}`}
                                                className="h-6 text-[10px] text-[#10B981] hover:bg-[#10B981]/10 gap-1 px-2"
                                              >
                                                <Play className="h-2.5 w-2.5" />
                                                Activate
                                              </Button>
                                            )}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                setEditValues((prev) => ({ ...prev, [prompt.key]: v.value }));
                                              }}
                                              className="h-6 text-[10px] text-[#3B82F6] hover:bg-[#3B82F6]/10 px-2"
                                            >
                                              Load
                                            </Button>
                                          </div>
                                        </div>

                                        <div className="text-[10px] text-[#6B7280]">
                                          {new Date(v.createdAt).toLocaleString()}
                                        </div>

                                        {/* Notes */}
                                        <div className="flex items-start gap-1.5">
                                          <StickyNote className="h-3 w-3 text-[#6B7280] mt-0.5 shrink-0" />
                                          <textarea
                                            value={editingNotes[v.id] ?? v.notes ?? ""}
                                            onChange={(e) =>
                                              setEditingNotes((prev) => ({ ...prev, [v.id]: e.target.value }))
                                            }
                                            placeholder="Add notes about this version..."
                                            className="flex-1 bg-transparent border-none text-[10px] text-[#9CA3AF] placeholder:text-[#4B5563] resize-none focus:outline-none min-h-[20px]"
                                            rows={1}
                                          />
                                          {(editingNotes[v.id] !== undefined && editingNotes[v.id] !== (v.notes ?? "")) && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleSaveNotes(prompt.key, v.id)}
                                              disabled={savingNotes === v.id}
                                              className="h-5 text-[10px] text-[#F59E0B] hover:bg-[#F59E0B]/10 px-1.5"
                                            >
                                              {savingNotes === v.id ? "..." : "Save"}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
