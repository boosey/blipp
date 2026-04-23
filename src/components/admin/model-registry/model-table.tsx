import { useState, useCallback, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Zap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/lib/api-client";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry } from "@/types/admin";
import { STAGES, formatPrice, formatLimits, formatMonthlyCost, getLimitStage } from "./helpers";
import { AddProviderForm, EditProviderForm } from "./provider-forms";

type SmokeTestState = { status: "idle" } | { status: "running" } | { status: "pass"; latencyMs: number } | { status: "fail"; error: string };

export interface ModelTableProps {
  models: AiModelEntry[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  addingProviderFor: string | null;
  setAddingProviderFor: (id: string | null) => void;
  editingProvider: string | null;
  setEditingProvider: (id: string | null) => void;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onToggleActive: (model: AiModelEntry) => void;
  onDeleteProvider: (model: AiModelEntry, providerId: string) => void;
  onDeleteModel: (model: AiModelEntry) => void;
  onRefresh: () => void;
}

export function ModelTable({
  models,
  expandedId,
  setExpandedId,
  addingProviderFor,
  setAddingProviderFor,
  editingProvider,
  setEditingProvider,
  apiFetch,
  onToggleActive,
  onDeleteProvider,
  onDeleteModel,
  onRefresh,
}: ModelTableProps) {
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[2fr_1fr_1fr_80px_100px_2fr_auto] gap-4 px-4 py-2.5 bg-[#0F1D32] text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider border-b border-white/5">
        <div>Model</div>
        <div>Stages</div>
        <div>Providers</div>
        <div>Developer</div>
        <div>Est. Cost</div>
        <div>Notes</div>
        <div className="w-20 text-right">Actions</div>
      </div>

      {models.map((model) => {
        const isExpanded = expandedId === model.id;
        return (
          <div key={model.id}>
            {/* Model row */}
            <div
              className="grid grid-cols-[2fr_1fr_1fr_80px_100px_2fr_auto] gap-4 px-4 py-3 items-center border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
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
              <div className="flex flex-wrap gap-1">
                {model.stages.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="text-[10px] border-white/10 text-[#9CA3AF] font-normal"
                  >
                    {STAGE_LABELS[s as AIStage] ?? s}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-col gap-0.5">
                {model.providers.length === 0 ? (
                  <span className="text-xs text-[#9CA3AF]">&mdash;</span>
                ) : (
                  model.providers.map((prov) => (
                    <span key={prov.id} className="text-[11px] text-[#9CA3AF] leading-tight">
                      {prov.providerLabel}
                    </span>
                  ))
                )}
              </div>
              <div className="text-xs text-[#9CA3AF]">{model.developer}</div>
              <div className="flex flex-col gap-0.5" title="Based on last 30 days of usage">
                {Object.entries(model.estMonthlyCosts).map(([stage, cost]) => (
                  <div key={stage} className="flex items-center gap-1">
                    <span className="text-[9px] text-[#6B7280] uppercase">{stage.slice(0, 3)}</span>
                    <span className="text-[11px] font-mono text-[#9CA3AF]">{formatMonthlyCost(cost)}</span>
                  </div>
                ))}
                {Object.keys(model.estMonthlyCosts).length === 0 && (
                  <span className="text-xs font-mono text-[#9CA3AF]">&mdash;</span>
                )}
              </div>
              <div className="text-[11px] text-[#9CA3AF] leading-snug whitespace-normal">{model.notes ?? "\u2014"}</div>
              <div className="w-20 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onToggleActive(model)}
                  className={model.isActive ? "text-[#22C55E] hover:text-[#22C55E]" : "text-[#EF4444] hover:text-[#EF4444]"}
                  title={model.isActive ? "Deactivate" : "Activate"}
                >
                  {model.isActive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDeleteModel(model)}
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
                  {/* Stage editor */}
                  <StageEditor model={model} apiFetch={apiFetch} onRefresh={onRefresh} />

                  {/* Provider header */}
                  <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">
                    <div>Provider</div>
                    <div>Pricing</div>
                    <div>Limits</div>
                    <div>Status</div>
                    <div className="w-28 text-right">Actions</div>
                  </div>

                  {model.providers.length === 0 && (
                    <div className="py-4 text-xs text-[#9CA3AF] text-center">No providers configured.</div>
                  )}

                  {model.providers.map((prov) => (
                    <ProviderRow
                      key={prov.id}
                      prov={prov}
                      model={model}
                      editingProvider={editingProvider}
                      setEditingProvider={setEditingProvider}
                      apiFetch={apiFetch}
                      onDeleteProvider={onDeleteProvider}
                      onRefresh={onRefresh}
                    />
                  ))}

                  {/* Add Provider */}
                  {addingProviderFor === model.id ? (
                    <AddProviderForm
                      modelId={model.id}
                      stages={model.stages}
                      apiFetch={apiFetch}
                      onDone={() => { setAddingProviderFor(null); onRefresh(); }}
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
  );
}

function StageEditor({
  model,
  apiFetch,
  onRefresh,
}: {
  model: AiModelEntry;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const toggleStage = async (stage: AIStage) => {
    const current = model.stages as string[];
    const next = current.includes(stage)
      ? current.filter((s) => s !== stage)
      : [...current, stage];
    if (next.length === 0) return; // must keep at least one
    setSaving(true);
    try {
      await apiFetch(`/ai-models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stages: next }),
      });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5">
      <span className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">Stages</span>
      <div className="flex gap-1.5">
        {STAGES.map((s) => {
          const active = (model.stages as string[]).includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStage(s)}
              disabled={saving || (active && model.stages.length === 1)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                active
                  ? "bg-[#3B82F6]/20 text-[#3B82F6] ring-1 ring-[#3B82F6]/40"
                  : "bg-[#1A2942] text-[#6B7280] hover:text-[#9CA3AF]"
              } ${saving ? "opacity-50" : ""}`}
              title={active && model.stages.length === 1 ? "Must keep at least one stage" : ""}
            >
              {STAGE_LABELS[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProviderRow({
  prov,
  model,
  editingProvider,
  setEditingProvider,
  apiFetch,
  onDeleteProvider,
  onRefresh,
}: {
  prov: AiModelEntry["providers"][number];
  model: AiModelEntry;
  editingProvider: string | null;
  setEditingProvider: (id: string | null) => void;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDeleteProvider: (model: AiModelEntry, providerId: string) => void;
  onRefresh: () => void;
}) {
  const [testState, setTestState] = useState<SmokeTestState>({ status: "idle" });
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (clearRef.current) clearTimeout(clearRef.current); }, []);

  const runTest = useCallback(async () => {
    setTestState({ status: "running" });
    try {
      const res = await apiFetch<{ data: { success: boolean; latencyMs: number; error?: string } }>(
        `/ai-models/${model.id}/providers/${prov.id}/smoke-test`,
        { method: "POST" }
      );
      if (res.data.success) {
        setTestState({ status: "pass", latencyMs: res.data.latencyMs });
      } else {
        setTestState({ status: "fail", error: res.data.error ?? "Unknown error" });
      }
    } catch (err) {
      setTestState({ status: "fail", error: err instanceof Error ? err.message : "Request failed" });
    }
    clearRef.current = setTimeout(() => setTestState({ status: "idle" }), 10000);
  }, [apiFetch, model.id, prov.id]);

  if (editingProvider === prov.id) {
    return (
      <div>
        <EditProviderForm
          provider={prov}
          modelId={model.id}
          stages={model.stages}
          apiFetch={apiFetch}
          onDone={() => { setEditingProvider(null); onRefresh(); }}
          onCancel={() => setEditingProvider(null)}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 items-center text-xs">
      <div className="text-[#F9FAFB]">
        <div>
          {prov.providerLabel}
          <span className="ml-1.5 text-[10px] font-mono text-[#9CA3AF]">({prov.provider})</span>
          {prov.isDefault && (
            <Badge className="ml-2 text-[9px] bg-[#3B82F6]/20 text-[#3B82F6] border-0 py-0">
              Default
            </Badge>
          )}
        </div>
        {prov.providerModelId && (
          <div className="text-[10px] font-mono text-[#6B7280] mt-0.5">{prov.providerModelId}</div>
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
      <div className="w-28 flex justify-end items-center gap-1">
        {testState.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin text-[#9CA3AF]" />
        ) : testState.status === "pass" ? (
          <span className="text-[10px] text-[#22C55E] font-mono">{(testState.latencyMs / 1000).toFixed(1)}s</span>
        ) : testState.status === "fail" ? (
          <span className="text-[10px] text-[#EF4444] truncate max-w-[60px]" title={testState.error}>{testState.error}</span>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={runTest}
          disabled={testState.status === "running"}
          className={`text-[#9CA3AF] hover:text-[#FBBF24] ${testState.status === "pass" ? "text-[#22C55E]" : testState.status === "fail" ? "text-[#EF4444]" : ""}`}
          title="Smoke test"
        >
          <Zap className="h-3 w-3" />
        </Button>
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
          onClick={() => onDeleteProvider(model, prov.id)}
          className="text-[#9CA3AF] hover:text-[#EF4444]"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
