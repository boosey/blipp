import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AIStage } from "@/lib/ai-models";
import type { AiModelEntry } from "@/types/admin";
import { formatPrice, formatLimits } from "./helpers";
import { AddProviderForm, EditProviderForm } from "./provider-forms";

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
      <div className="grid grid-cols-[2fr_80px_120px_80px_1fr_auto] gap-4 px-4 py-2.5 bg-[#0F1D32] text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider border-b border-white/5">
        <div>Model</div>
        <div>Stage</div>
        <div>Providers</div>
        <div>Developer</div>
        <div>Notes</div>
        <div className="w-20 text-right">Actions</div>
      </div>

      {models.map((model) => {
        const isExpanded = expandedId === model.id;
        return (
          <div key={model.id}>
            {/* Model row */}
            <div
              className="grid grid-cols-[2fr_80px_120px_80px_1fr_auto] gap-4 px-4 py-3 items-center border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
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
                          onDone={() => { setEditingProvider(null); onRefresh(); }}
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
                              onClick={() => onDeleteProvider(model, prov.id)}
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
