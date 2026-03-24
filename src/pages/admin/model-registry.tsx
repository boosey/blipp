import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry, AiModelProviderEntry } from "@/types/admin";

// ── Helpers ──

const STAGES: AIStage[] = ["stt", "distillation", "narrative", "tts"];

function formatPrice(p: AiModelProviderEntry): string {
  if (p.pricePerMinute != null) return `$${p.pricePerMinute.toFixed(5)}/min`;
  if (p.priceInputPerMToken != null)
    return `$${p.priceInputPerMToken}/$${p.priceOutputPerMToken} /1M tok`;
  if (p.pricePerKChars != null) return `$${p.pricePerKChars}/1K chars`;
  return "\u2014";
}

function formatLimits(limits?: Record<string, unknown> | null): string {
  if (!limits || Object.keys(limits).length === 0) return "\u2014";
  return Object.entries(limits)
    .map(([k, v]) => {
      if (k === "maxFileSizeBytes" && typeof v === "number") return `${(v / 1024 / 1024).toFixed(0)}MB max`;
      if (k === "maxInputChars" && typeof v === "number") return `${v.toLocaleString()} chars max`;
      return `${k}: ${v}`;
    })
    .join(", ");
}

// ── Main Page ──

export default function ModelRegistryPage() {
  const apiFetch = useAdminFetch();
  const [models, setModels] = useState<AiModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<AIStage | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [addingProviderFor, setAddingProviderFor] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<AiModelEntry | null>(null);
  const [lastProviderModelId, setLastProviderModelId] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const url = stageFilter === "all" ? "/ai-models?includeInactive=true" : `/ai-models?stage=${stageFilter}&includeInactive=true`;
      const res = await apiFetch<{ data: AiModelEntry[] }>(url);
      setModels(res.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiFetch, stageFilter]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const toggleActive = async (model: AiModelEntry) => {
    await apiFetch(`/ai-models/${model.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !model.isActive }),
    });
    fetchModels();
  };

  const deleteProvider = async (model: AiModelEntry, providerId: string) => {
    const res = await apiFetch<{ success: boolean; remainingProviders: number }>(
      `/ai-models/${model.id}/providers/${providerId}`,
      { method: "DELETE" },
    );
    if (res.remainingProviders === 0) {
      setLastProviderModelId(model.id);
    }
    fetchModels();
  };

  const deleteModel = async (model: AiModelEntry) => {
    await apiFetch(`/ai-models/${model.id}`, { method: "DELETE" });
    setDeleteModelConfirm(null);
    setLastProviderModelId(null);
    setExpandedId(null);
    fetchModels();
  };

  const filtered = models;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Model Registry</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Manage AI models and inference providers across pipeline stages
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddModel(true)}
          className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Model
        </Button>
      </div>

      {/* Stage Tabs */}
      <div className="flex gap-1 bg-[#0F1D32] rounded-lg p-1 border border-white/5 w-fit">
        <button
          onClick={() => setStageFilter("all")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            stageFilter === "all"
              ? "bg-[#3B82F6]/20 text-[#3B82F6]"
              : "text-[#9CA3AF] hover:text-[#F9FAFB]"
          }`}
        >
          All ({models.length})
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              stageFilter === s
                ? "bg-[#3B82F6]/20 text-[#3B82F6]"
                : "text-[#9CA3AF] hover:text-[#F9FAFB]"
            }`}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Add Model Form */}
      {showAddModel && (
        <AddModelForm
          apiFetch={apiFetch}
          onDone={() => { setShowAddModel(false); fetchModels(); }}
          onCancel={() => setShowAddModel(false)}
        />
      )}

      {/* Models Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9CA3AF] text-sm">No models found.</div>
      ) : (
        <div className="border border-white/5 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_1fr_3fr_1fr_auto] gap-4 px-4 py-2.5 bg-[#0F1D32] text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider border-b border-white/5">
            <div>Model</div>
            <div>Stage</div>
            <div>Developer</div>
            <div>Notes</div>
            <div>Providers</div>
            <div className="w-20 text-right">Actions</div>
          </div>

          {filtered.map((model) => {
            const isExpanded = expandedId === model.id;
            return (
              <div key={model.id}>
                {/* Model row */}
                <div
                  className="grid grid-cols-[2fr_1fr_1fr_3fr_1fr_auto] gap-4 px-4 py-3 items-center border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : model.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-[#F9FAFB]">{model.label}</span>
                      <span className="ml-2 text-[10px] font-mono text-[#9CA3AF]">{model.modelId}</span>
                    </div>
                  </div>
                  <div>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-white/10 text-[#9CA3AF] font-normal"
                    >
                      {STAGE_LABELS[model.stage as AIStage] ?? model.stage}
                    </Badge>
                  </div>
                  <div className="text-xs text-[#9CA3AF]">{model.developer}</div>
                  <div className="text-[11px] text-[#9CA3AF] leading-snug whitespace-normal">{model.notes ?? "\u2014"}</div>
                  <div className="text-xs text-[#9CA3AF]">{model.providers.length}</div>
                  <div className="w-20 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => toggleActive(model)}
                      className={model.isActive ? "text-[#22C55E] hover:text-[#22C55E]" : "text-[#EF4444] hover:text-[#EF4444]"}
                      title={model.isActive ? "Deactivate" : "Activate"}
                    >
                      {model.isActive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeleteModelConfirm(model)}
                      className="text-[#9CA3AF] hover:text-[#EF4444]"
                      title="Delete model"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded: Providers */}
                {isExpanded && (
                  <div className="bg-[#0A1628]/50 border-b border-white/5">
                    <div className="px-8 py-2">
                      {/* Provider header */}
                      <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">
                        <div>Provider</div>
                        <div>Pricing</div>
                        <div>Limits</div>
                        <div>Status</div>
                        <div className="w-16 text-right">Actions</div>
                      </div>

                      {model.providers.length === 0 && (
                        <div className="py-4 text-xs text-[#9CA3AF] text-center">No providers configured.</div>
                      )}

                      {model.providers.map((prov) => (
                        <div key={prov.id}>
                          {editingProvider === prov.id ? (
                            <EditProviderForm
                              provider={prov}
                              modelId={model.id}
                              stage={model.stage}
                              apiFetch={apiFetch}
                              onDone={() => { setEditingProvider(null); fetchModels(); }}
                              onCancel={() => setEditingProvider(null)}
                            />
                          ) : (
                            <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 items-center text-xs">
                              <div className="text-[#F9FAFB]">
                                {prov.providerLabel}
                                <span className="ml-1.5 text-[10px] font-mono text-[#9CA3AF]">({prov.provider})</span>
                                {prov.isDefault && (
                                  <Badge className="ml-2 text-[9px] bg-[#3B82F6]/20 text-[#3B82F6] border-0 py-0">
                                    Default
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[#9CA3AF] font-mono text-[11px]">{formatPrice(prov)}</div>
                              <div className="text-[#9CA3AF] text-[11px]">{formatLimits(prov.limits)}</div>
                              <div>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] border-0 ${
                                    prov.isAvailable
                                      ? "bg-[#22C55E]/10 text-[#22C55E]"
                                      : "bg-[#EF4444]/10 text-[#EF4444]"
                                  }`}
                                >
                                  {prov.isAvailable ? "Available" : "Unavailable"}
                                </Badge>
                              </div>
                              <div className="w-16 flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => setEditingProvider(prov.id)}
                                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => deleteProvider(model, prov.id)}
                                  className="text-[#9CA3AF] hover:text-[#EF4444]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add Provider */}
                      {addingProviderFor === model.id ? (
                        <AddProviderForm
                          modelId={model.id}
                          stage={model.stage}
                          apiFetch={apiFetch}
                          onDone={() => { setAddingProviderFor(null); fetchModels(); }}
                          onCancel={() => setAddingProviderFor(null)}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddingProviderFor(model.id)}
                          className="text-[#3B82F6] hover:text-[#3B82F6] hover:bg-[#3B82F6]/10 text-xs gap-1 mt-1"
                        >
                          <Plus className="h-3 w-3" />
                          Add Provider
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Model Confirmation */}
      <Dialog open={!!deleteModelConfirm} onOpenChange={(open) => !open && setDeleteModelConfirm(null)}>
        <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-[#F9FAFB]">Delete Model</DialogTitle>
            <DialogDescription className="text-[#9CA3AF]">
              This will permanently delete <span className="font-semibold text-[#F9FAFB]">{deleteModelConfirm?.label}</span> and
              all {deleteModelConfirm?.providers.length ?? 0} provider{deleteModelConfirm?.providers.length === 1 ? "" : "s"}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteModelConfirm(null)} className="text-[#9CA3AF] text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => deleteModelConfirm && deleteModel(deleteModelConfirm)}
              className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white text-xs"
            >
              Delete Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last Provider Deleted — offer to delete model */}
      <Dialog open={!!lastProviderModelId} onOpenChange={(open) => !open && setLastProviderModelId(null)}>
        <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-[#F9FAFB]">No Providers Remaining</DialogTitle>
            <DialogDescription className="text-[#9CA3AF]">
              This model has no providers left. Would you like to delete the model entry too?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setLastProviderModelId(null)} className="text-[#9CA3AF] text-xs">
              Keep Model
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const model = models.find((m) => m.id === lastProviderModelId);
                if (model) deleteModel(model);
              }}
              className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white text-xs"
            >
              Delete Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Add Model Form ──

function AddModelForm({
  apiFetch,
  onDone,
  onCancel,
}: {
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<string>("");
  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [developer, setDeveloper] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!stage || !modelId || !label || !developer) return;
    setSaving(true);
    try {
      await apiFetch("/ai-models", {
        method: "POST",
        body: JSON.stringify({ stage, modelId, label, developer }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0F1D32] border border-white/10 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#F9FAFB]">Add New Model</h3>
      <div className="grid grid-cols-4 gap-3">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            {STAGES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Model ID (e.g. whisper-1)"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
        <Input
          placeholder="Label (e.g. Whisper v1)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
        <Input
          placeholder="Developer (e.g. openai)"
          value={developer}
          onChange={(e) => setDeveloper(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !stage || !modelId || !label || !developer} className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-[#9CA3AF] text-xs">Cancel</Button>
      </div>
    </div>
  );
}

// ── Add Provider Form ──

function buildLimitsPayload(stage: string, limitValue: string): Record<string, unknown> | undefined {
  if (!limitValue.trim()) return undefined;
  const num = parseFloat(limitValue);
  if (isNaN(num)) return undefined;
  if (stage === "stt") return { maxFileSizeBytes: Math.round(num * 1024 * 1024) };
  if (stage === "tts") return { maxInputChars: Math.round(num) };
  return undefined;
}

function extractLimitValue(stage: string, limits?: Record<string, unknown> | null): string {
  if (!limits) return "";
  if (stage === "stt" && typeof limits.maxFileSizeBytes === "number") return (limits.maxFileSizeBytes / 1024 / 1024).toString();
  if (stage === "tts" && typeof limits.maxInputChars === "number") return limits.maxInputChars.toString();
  return "";
}

function LimitInput({ stage, value, onChange, className }: { stage: string; value: string; onChange: (v: string) => void; className?: string }) {
  if (stage === "stt") return <Input type="number" placeholder="Max file size (MB)" value={value} onChange={(e) => onChange(e.target.value)} className={className} />;
  if (stage === "tts") return <Input type="number" placeholder="Max input chars" value={value} onChange={(e) => onChange(e.target.value)} className={className} />;
  return null;
}

function AddProviderForm({
  modelId,
  stage,
  apiFetch,
  onDone,
  onCancel,
}: {
  modelId: string;
  stage: string;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState("");
  const [providerLabel, setProviderLabel] = useState("");
  const [pricePerMinute, setPricePerMinute] = useState("");
  const [priceInputPerMToken, setPriceInputPerMToken] = useState("");
  const [priceOutputPerMToken, setPriceOutputPerMToken] = useState("");
  const [pricePerKChars, setPricePerKChars] = useState("");
  const [limitValue, setLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!provider || !providerLabel) return;
    setSaving(true);
    try {
      await apiFetch(`/ai-models/${modelId}/providers`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          providerLabel,
          ...(pricePerMinute && { pricePerMinute: parseFloat(pricePerMinute) }),
          ...(priceInputPerMToken && { priceInputPerMToken: parseFloat(priceInputPerMToken) }),
          ...(priceOutputPerMToken && { priceOutputPerMToken: parseFloat(priceOutputPerMToken) }),
          ...(pricePerKChars && { pricePerKChars: parseFloat(pricePerKChars) }),
          ...({ limits: buildLimitsPayload(stage, limitValue) ?? null }),
        }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#1A2942]/50 border border-white/5 rounded p-3 mt-2 space-y-2">
      <div className="text-xs font-medium text-[#F9FAFB]">Add Provider</div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Provider key" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="Display name" value={providerLabel} onChange={(e) => setProviderLabel(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/min" value={pricePerMinute} onChange={(e) => setPricePerMinute(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="$/1M input tok" value={priceInputPerMToken} onChange={(e) => setPriceInputPerMToken(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/1M output tok" value={priceOutputPerMToken} onChange={(e) => setPriceOutputPerMToken(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/1K chars" value={pricePerKChars} onChange={(e) => setPricePerKChars(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      </div>
      {(stage === "stt" || stage === "tts") && (
        <LimitInput stage={stage} value={limitValue} onChange={setLimitValue} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !provider || !providerLabel} className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-[11px] h-7">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-[#9CA3AF] text-[11px] h-7">Cancel</Button>
      </div>
    </div>
  );
}

// ── Edit Provider Form ──

function EditProviderForm({
  provider,
  modelId,
  stage,
  apiFetch,
  onDone,
  onCancel,
}: {
  provider: AiModelProviderEntry;
  modelId: string;
  stage: string;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pricePerMinute, setPricePerMinute] = useState(provider.pricePerMinute?.toString() ?? "");
  const [priceInputPerMToken, setPriceInputPerMToken] = useState(provider.priceInputPerMToken?.toString() ?? "");
  const [priceOutputPerMToken, setPriceOutputPerMToken] = useState(provider.priceOutputPerMToken?.toString() ?? "");
  const [pricePerKChars, setPricePerKChars] = useState(provider.pricePerKChars?.toString() ?? "");
  const [limitValue, setLimitValue] = useState(extractLimitValue(stage, provider.limits));
  const [saving, setSaving] = useState(false);

  const hasLimitField = stage === "stt" || stage === "tts";

  const submit = async () => {
    setSaving(true);
    try {
      await apiFetch(`/ai-models/${modelId}/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(pricePerMinute ? { pricePerMinute: parseFloat(pricePerMinute) } : { pricePerMinute: null }),
          ...(priceInputPerMToken ? { priceInputPerMToken: parseFloat(priceInputPerMToken) } : { priceInputPerMToken: null }),
          ...(priceOutputPerMToken ? { priceOutputPerMToken: parseFloat(priceOutputPerMToken) } : { priceOutputPerMToken: null }),
          ...(pricePerKChars ? { pricePerKChars: parseFloat(pricePerKChars) } : { pricePerKChars: null }),
          ...(hasLimitField && { limits: buildLimitsPayload(stage, limitValue) ?? null }),
        }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 items-center">
      <div className="text-xs text-[#F9FAFB]">{provider.providerLabel}</div>
      <div className="grid grid-cols-2 gap-1">
        {provider.pricePerMinute != null || (!provider.priceInputPerMToken && !provider.pricePerKChars) ? (
          <Input placeholder="$/min" value={pricePerMinute} onChange={(e) => setPricePerMinute(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB] col-span-2" />
        ) : provider.priceInputPerMToken != null ? (
          <>
            <Input placeholder="$/1M in" value={priceInputPerMToken} onChange={(e) => setPriceInputPerMToken(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
            <Input placeholder="$/1M out" value={priceOutputPerMToken} onChange={(e) => setPriceOutputPerMToken(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
          </>
        ) : (
          <Input placeholder="$/1K chars" value={pricePerKChars} onChange={(e) => setPricePerKChars(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB] col-span-2" />
        )}
      </div>
      {hasLimitField ? (
        <LimitInput stage={stage} value={limitValue} onChange={setLimitValue} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      ) : (
        <div />
      )}
      <div />
      <div className="w-16 flex justify-end gap-1">
        <Button variant="ghost" size="icon-xs" onClick={submit} disabled={saving} className="text-[#22C55E] hover:text-[#22C55E]">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onCancel} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
