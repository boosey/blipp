import {
  Loader2,
  Check,
  X,
  Shield,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VoicePresetEntry } from "@/types/admin";

export interface PresetTableProps {
  presets: VoicePresetEntry[];
  loading: boolean;
  chainProviders: string[];
  onToggleActive: (preset: VoicePresetEntry) => void;
  onEdit: (preset: VoicePresetEntry) => void;
  onDelete: (preset: VoicePresetEntry) => void;
}

function getMissingProviders(preset: VoicePresetEntry, chainProviders: string[]): string[] {
  if (!preset.isActive) return [];
  const config = preset.config as Record<string, unknown>;
  return chainProviders.filter((provider) => {
    const pc = config?.[provider] as Record<string, unknown> | undefined;
    return !pc?.voice;
  });
}

export function PresetTable({ presets, loading, chainProviders, onToggleActive, onEdit, onDelete }: PresetTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" />
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="text-center py-16 text-[#9CA3AF] text-sm">No voice presets found.</div>
    );
  }

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-[#0F1D32] text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider border-b border-white/5">
        <div>Name</div>
        <div>Description</div>
        <div className="w-16 text-center">System</div>
        <div className="w-16 text-center">Active</div>
        <div className="w-20 text-right">Actions</div>
      </div>

      {presets.map((preset) => {
        const missing = getMissingProviders(preset, chainProviders);
        return (
          <div
            key={preset.id}
            className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 px-4 py-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#F9FAFB]">{preset.name}</span>
                {preset.isSystem && (
                  <Shield className="h-3.5 w-3.5 text-[#3B82F6]" />
                )}
                {missing.length > 0 && (
                  <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" />
                )}
              </div>
              <div className="text-xs text-[#9CA3AF] truncate">
                {preset.description || "\u2014"}
              </div>
              <div className="w-16 text-center">
                {preset.isSystem ? (
                  <Badge className="text-[9px] bg-[#3B82F6]/20 text-[#3B82F6] border-0 py-0">Yes</Badge>
                ) : (
                  <span className="text-[10px] text-[#9CA3AF]">No</span>
                )}
              </div>
              <div className="w-16 text-center">
                <Badge
                  variant="outline"
                  className={`text-[10px] border-0 ${
                    preset.isActive
                      ? "bg-[#22C55E]/10 text-[#22C55E]"
                      : "bg-[#EF4444]/10 text-[#EF4444]"
                  }`}
                >
                  {preset.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="w-20 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onToggleActive(preset)}
                  className={preset.isActive ? "text-[#22C55E] hover:text-[#22C55E]" : "text-[#EF4444] hover:text-[#EF4444]"}
                  title={preset.isActive ? "Deactivate" : "Activate"}
                >
                  {preset.isActive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onEdit(preset)}
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!preset.isSystem && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDelete(preset)}
                    className="text-[#9CA3AF] hover:text-[#EF4444]"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {missing.length > 0 && (
              <div className="px-4 pb-2 -mt-1">
                <p className="text-[10px] text-[#F59E0B]">
                  Missing config for: {missing.join(", ")} — will use system defaults
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
