import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Save, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAdminFetch } from "../../lib/admin-api";

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

export default function PromptManagement() {
  const apiFetch = useAdminFetch();
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: PromptEntry[] }>("/prompts");
      setPrompts(res.data);
      const values: Record<string, string> = {};
      for (const p of res.data) values[p.key] = p.value;
      setEditValues(values);
    } catch {
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async (key: string) => {
    setSaving(key);
    try {
      await apiFetch(`/prompts/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValues[key] }),
      });
      toast.success("Prompt updated");
      await load();
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSaving(null);
    }
  }, [apiFetch, editValues, load]);

  const handleReset = useCallback(async (key: string) => {
    setSaving(key);
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
  }, [apiFetch, load]);

  const isDirty = (key: string) => {
    const original = prompts.find((p) => p.key === key);
    return original && editValues[key] !== original.value;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Prompt Management</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[#1A2942] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Group by stage
  const stages = new Map<string, PromptEntry[]>();
  for (const p of prompts) {
    if (!stages.has(p.stage)) stages.set(p.stage, []);
    stages.get(p.stage)!.push(p);
  }

  const stageLabels: Record<string, string> = {
    distillation: "Stage 2: Distillation (Claims Extraction)",
    narrative: "Stage 3: Narrative Generation",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prompt Management</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          View and edit LLM prompts used in the pipeline. Changes take effect within 60 seconds (config cache TTL).
        </p>
      </div>

      {Array.from(stages.entries()).map(([stage, entries]) => (
        <div key={stage}>
          <h2 className="text-lg font-semibold mb-3 text-[#60A5FA]">
            {stageLabels[stage] ?? stage}
          </h2>
          <div className="space-y-3">
            {entries.map((prompt) => {
              const expanded = expandedKey === prompt.key;
              const dirty = isDirty(prompt.key);
              const isSaving = saving === prompt.key;

              return (
                <div
                  key={prompt.key}
                  className="bg-[#1A2942] border border-[#2A3F5F] rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedKey(expanded ? null : prompt.key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1E3352] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{prompt.label}</span>
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
                      <p className="text-xs text-[#9CA3AF] mt-0.5">{prompt.description}</p>
                    </div>
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
                    )}
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 space-y-3">
                      <textarea
                        value={editValues[prompt.key] ?? ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                        }
                        className="w-full h-64 bg-[#0F1B2E] border border-[#2A3F5F] rounded-lg p-3 text-sm font-mono text-[#E5E7EB] placeholder:text-[#6B7280] resize-y focus:outline-none focus:border-[#3B82F6]"
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-[#6B7280]">
                          {prompt.updatedAt
                            ? `Last updated: ${new Date(prompt.updatedAt).toLocaleString()}`
                            : "Using default"}
                        </div>
                        <div className="flex items-center gap-2">
                          {!prompt.isDefault && (
                            <button
                              onClick={() => handleReset(prompt.key)}
                              disabled={isSaving}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset to Default
                            </button>
                          )}
                          <button
                            onClick={() => handleSave(prompt.key)}
                            disabled={isSaving || !dirty}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#3B82F6] text-white rounded hover:bg-[#2563EB] transition-colors disabled:opacity-50"
                          >
                            <Save className="w-3 h-3" />
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
