import {
  RotateCcw,
  Save,
  History,
  ChevronDown,
  ChevronRight,
  Play,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PromptVersionEntry } from "@/types/admin";

export interface PromptEntry {
  key: string;
  label: string;
  description: string;
  stage: string;
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PromptSectionProps {
  stageKey: string;
  stagePrompts: PromptEntry[];
  editValues: Record<string, string>;
  onEditValueChange: (key: string, value: string) => void;
  stageDirty: boolean;
  stageCustomized: boolean;
  stageSaving: boolean;
  changeDescription: string;
  onChangeDescriptionUpdate: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
  // Version history
  expandedVersions: boolean;
  onToggleVersionHistory: () => void;
  versions: PromptVersionEntry[];
  saving: string | null;
  onActivateVersion: (versionId: string) => void;
  onLoadVersion: (versionValues: Record<string, string>) => void;
  editingNotes: Record<string, string>;
  onEditNote: (versionId: string, value: string) => void;
  savingNotes: string | null;
  onSaveNotes: (versionId: string) => void;
}

export function PromptSection({
  stagePrompts,
  editValues,
  onEditValueChange,
  stageDirty,
  stageCustomized,
  stageSaving,
  changeDescription,
  onChangeDescriptionUpdate,
  onSave,
  onReset,
  expandedVersions,
  onToggleVersionHistory,
  versions,
  saving,
  onActivateVersion,
  onLoadVersion,
  editingNotes,
  onEditNote,
  savingNotes,
  onSaveNotes,
}: PromptSectionProps) {
  return (
    <div className="bg-[#1A2942] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#F9FAFB]">Prompts</span>
        <div className="flex items-center gap-1.5">
          {stageCustomized && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B]">
              customized
            </span>
          )}
          {stageDirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3B82F6]/20 text-[#3B82F6]">
              unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* Individual prompt editors */}
      {stagePrompts.map((prompt) => {
        const dirty = editValues[prompt.key] !== prompt.value;
        return (
          <div key={prompt.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#F9FAFB]">{prompt.label}</span>
              {dirty && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6]/70">
                  edited
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#9CA3AF]">{prompt.description}</p>
            <textarea
              value={editValues[prompt.key] ?? ""}
              onChange={(e) => onEditValueChange(prompt.key, e.target.value)}
              className="w-full h-48 bg-[#0F1D32] border border-white/10 rounded-lg p-3 text-xs font-mono text-[#E5E7EB] placeholder:text-[#6B7280] resize-y focus:outline-none focus:border-[#3B82F6]"
              spellCheck={false}
            />
          </div>
        );
      })}

      {/* Change description input */}
      {stageDirty && (
        <input
          type="text"
          value={changeDescription}
          onChange={(e) => onChangeDescriptionUpdate(e.target.value)}
          placeholder="Describe this change (e.g. 'improved excerpt handling')..."
          className="w-full bg-[#0F1D32] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#E5E7EB] placeholder:text-[#4B5563] focus:outline-none focus:border-[#3B82F6]"
        />
      )}

      {/* Save/Reset actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-[10px] text-[#6B7280]">
          {stagePrompts.some((p) => p.updatedAt)
            ? `Last updated: ${new Date(
                stagePrompts
                  .filter((p) => p.updatedAt)
                  .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0]
                  ?.updatedAt ?? ""
              ).toLocaleString()}`
            : "Using defaults"}
        </div>
        <div className="flex items-center gap-2">
          {stageCustomized && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={stageSaving}
              className="h-7 text-xs text-[#F59E0B] hover:bg-[#F59E0B]/10 gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset All to Default
            </Button>
          )}
          <Button
            size="sm"
            onClick={onSave}
            disabled={stageSaving || !stageDirty}
            className="h-7 text-xs bg-[#3B82F6] hover:bg-[#2563EB] text-white gap-1"
          >
            <Save className="h-3 w-3" />
            {stageSaving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Version History */}
      <div className="border-t border-white/5 pt-2 mt-2">
        <button
          onClick={onToggleVersionHistory}
          className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors"
        >
          <History className="h-3 w-3" />
          Version History
          {expandedVersions ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        {expandedVersions && (
          <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-[10px] text-[#6B7280] italic">No versions saved yet</p>
            ) : (
              versions.map((v) => (
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
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono font-semibold text-[#F9FAFB] shrink-0">
                        v{v.version}
                      </span>
                      {v.label ? (
                        <span className="text-[10px] text-[#E5E7EB] truncate">{v.label}</span>
                      ) : (
                        <span className="text-[10px] text-[#4B5563] italic">no description</span>
                      )}
                      <span className="text-[10px] text-[#6B7280] shrink-0">
                        ({Object.keys(v.values).length} prompts)
                      </span>
                      {v.isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] shrink-0">
                          active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!v.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onActivateVersion(v.id)}
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
                        onClick={() => onLoadVersion(v.values)}
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
                      onChange={(e) => onEditNote(v.id, e.target.value)}
                      placeholder="Add notes about this version..."
                      className="flex-1 bg-transparent border-none text-[10px] text-[#9CA3AF] placeholder:text-[#4B5563] resize-none focus:outline-none min-h-[20px]"
                      rows={1}
                    />
                    {(editingNotes[v.id] !== undefined && editingNotes[v.id] !== (v.notes ?? "")) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSaveNotes(v.id)}
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
}
