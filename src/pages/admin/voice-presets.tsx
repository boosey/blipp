import { useState, useEffect, useCallback } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminFetch } from "@/lib/admin-api";
import type { VoicePresetEntry } from "@/types/admin";
import { PresetTable } from "@/components/admin/voice-presets/preset-table";
import { PresetDialog, type TtsChainEntry } from "@/components/admin/voice-presets/preset-dialog";

export default function VoicePresetsPage() {
  const apiFetch = useAdminFetch();
  const [presets, setPresets] = useState<VoicePresetEntry[]>([]);
  const [ttsChain, setTtsChain] = useState<TtsChainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPreset, setEditingPreset] = useState<VoicePresetEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<VoicePresetEntry | null>(null);

  const fetchPresets = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: VoicePresetEntry[] }>("/voice-presets");
      setPresets(res.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const fetchTtsChain = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TtsChainEntry[] }>("/voice-presets/tts-chain");
      setTtsChain(res.data ?? []);
    } catch {
      /* ignore */
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchPresets();
    fetchTtsChain();
  }, [fetchPresets, fetchTtsChain]);

  const toggleActive = async (preset: VoicePresetEntry) => {
    try {
      await apiFetch(`/voice-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !preset.isActive }),
      });
      fetchPresets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle");
    }
  };

  const deletePreset = async (preset: VoicePresetEntry) => {
    try {
      await apiFetch(`/voice-presets/${preset.id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchPresets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  // Find presets missing config for active chain providers
  const chainProviders = ttsChain.map((e) => e.provider);
  const presetsWithWarnings = new Set<string>();
  for (const preset of presets) {
    if (!preset.isActive) continue;
    const config = preset.config as Record<string, unknown>;
    for (const provider of chainProviders) {
      const pc = config?.[provider] as Record<string, unknown> | undefined;
      if (!pc?.voice) {
        presetsWithWarnings.add(preset.id);
        break;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Voice Presets</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Manage TTS voice configurations for briefing audio generation
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Preset
        </Button>
      </div>

      {/* Chain coverage warning */}
      {presetsWithWarnings.size > 0 && (
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <div className="text-xs text-[#F59E0B]">
            <span className="font-medium">{presetsWithWarnings.size} active preset{presetsWithWarnings.size > 1 ? "s" : ""}</span>{" "}
            missing voice config for one or more providers in the TTS chain ({chainProviders.join(", ")}).
            These presets will fall back to system defaults for the unconfigured provider.
          </div>
        </div>
      )}

      <PresetTable
        presets={presets}
        loading={loading}
        chainProviders={chainProviders}
        onToggleActive={toggleActive}
        onEdit={setEditingPreset}
        onDelete={setDeleteConfirm}
      />

      <PresetDialog
        open={showCreate || !!editingPreset}
        preset={editingPreset}
        ttsChain={ttsChain}
        onClose={() => { setShowCreate(false); setEditingPreset(null); }}
        onSaved={() => { setShowCreate(false); setEditingPreset(null); fetchPresets(); }}
        apiFetch={apiFetch}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-[#F9FAFB]">Delete Voice Preset</DialogTitle>
            <DialogDescription className="text-[#9CA3AF]">
              Permanently delete <span className="font-semibold text-[#F9FAFB]">{deleteConfirm?.name}</span>?
              Subscriptions using this preset will fall back to the system default.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)} className="text-[#9CA3AF] text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => deleteConfirm && deletePreset(deleteConfirm)}
              className="bg-[#EF4444] hover:bg-[#EF4444]/80 text-white text-xs"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
