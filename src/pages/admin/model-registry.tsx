import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry } from "@/types/admin";
import { STAGES } from "@/components/admin/model-registry/helpers";
import { AddModelForm } from "@/components/admin/model-registry/add-model-form";
import { ModelTable } from "@/components/admin/model-registry/model-table";
import { DeleteModelDialog, NoProvidersDialog } from "@/components/admin/model-registry/delete-dialogs";

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
      ) : models.length === 0 ? (
        <div className="text-center py-16 text-[#9CA3AF] text-sm">No models found.</div>
      ) : (
        <ModelTable
          models={models}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          addingProviderFor={addingProviderFor}
          setAddingProviderFor={setAddingProviderFor}
          editingProvider={editingProvider}
          setEditingProvider={setEditingProvider}
          apiFetch={apiFetch}
          onToggleActive={toggleActive}
          onDeleteProvider={deleteProvider}
          onDeleteModel={setDeleteModelConfirm}
          onRefresh={fetchModels}
        />
      )}

      <DeleteModelDialog
        model={deleteModelConfirm}
        onClose={() => setDeleteModelConfirm(null)}
        onConfirm={deleteModel}
      />

      <NoProvidersDialog
        open={!!lastProviderModelId}
        onClose={() => setLastProviderModelId(null)}
        onDeleteModel={() => {
          const model = models.find((m) => m.id === lastProviderModelId);
          if (model) deleteModel(model);
        }}
      />
    </div>
  );
}
