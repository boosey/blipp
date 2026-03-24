import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { useAdminFetch } from "@/lib/admin-api";
import type { VoicePresetEntry, VoicePresetConfig } from "@/types/admin";

// ── Constants ──

const OPENAI_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "nova", "onyx", "sage", "shimmer", "verse",
] as const;

const DEFAULT_CONFIG: VoicePresetConfig = {
  openai: { voice: "nova", instructions: "", speed: 1.0 },
  groq: { voice: "austin" },
  cloudflare: {},
};

// ── Main Page ──

export default function VoicePresetsPage() {
  const apiFetch = useAdminFetch();
  const [presets, setPresets] = useState<VoicePresetEntry[]>([]);
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

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

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

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" />
        </div>
      ) : presets.length === 0 ? (
        <div className="text-center py-16 text-[#9CA3AF] text-sm">No voice presets found.</div>
      ) : (
        <div className="border border-white/5 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-[#0F1D32] text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider border-b border-white/5">
            <div>Name</div>
            <div>Description</div>
            <div className="w-16 text-center">System</div>
            <div className="w-16 text-center">Active</div>
            <div className="w-20 text-right">Actions</div>
          </div>

          {presets.map((preset) => (
            <div
              key={preset.id}
              className="grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-white/5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#F9FAFB]">{preset.name}</span>
                {preset.isSystem && (
                  <Shield className="h-3.5 w-3.5 text-[#3B82F6]" />
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
                  onClick={() => toggleActive(preset)}
                  className={preset.isActive ? "text-[#22C55E] hover:text-[#22C55E]" : "text-[#EF4444] hover:text-[#EF4444]"}
                  title={preset.isActive ? "Deactivate" : "Activate"}
                >
                  {preset.isActive ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setEditingPreset(preset)}
                  className="text-[#9CA3AF] hover:text-[#F9FAFB]"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!preset.isSystem && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeleteConfirm(preset)}
                    className="text-[#9CA3AF] hover:text-[#EF4444]"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <PresetDialog
        open={showCreate || !!editingPreset}
        preset={editingPreset}
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

// ── Create/Edit Dialog ──

function PresetDialog({
  open,
  preset,
  onClose,
  onSaved,
  apiFetch,
}: {
  open: boolean;
  preset: VoicePresetEntry | null;
  onClose: () => void;
  onSaved: () => void;
  apiFetch: ReturnType<typeof useAdminFetch>;
}) {
  const isEdit = !!preset;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openaiVoice, setOpenaiVoice] = useState("nova");
  const [openaiInstructions, setOpenaiInstructions] = useState("");
  const [openaiSpeed, setOpenaiSpeed] = useState("1.0");
  const [groqVoice, setGroqVoice] = useState("austin");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (preset) {
        setName(preset.name);
        setDescription(preset.description ?? "");
        setOpenaiVoice(preset.config.openai?.voice ?? "nova");
        setOpenaiInstructions(preset.config.openai?.instructions ?? "");
        setOpenaiSpeed(String(preset.config.openai?.speed ?? 1.0));
        setGroqVoice(preset.config.groq?.voice ?? "austin");
      } else {
        setName("");
        setDescription("");
        setOpenaiVoice("nova");
        setOpenaiInstructions("");
        setOpenaiSpeed("1.0");
        setGroqVoice("austin");
      }
    }
  }, [open, preset]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const config: VoicePresetConfig = {
      openai: {
        voice: openaiVoice,
        instructions: openaiInstructions || undefined,
        speed: parseFloat(openaiSpeed) || 1.0,
      },
      groq: { voice: groqVoice },
      cloudflare: {},
    };
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { config };
        if (!preset.isSystem) {
          body.name = name;
          body.description = description || null;
        }
        await apiFetch(`/voice-presets/${preset.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Preset updated");
      } else {
        await apiFetch("/voice-presets", {
          method: "POST",
          body: JSON.stringify({ name, description: description || null, config }),
        });
        toast.success("Preset created");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#F9FAFB]">
            {isEdit ? "Edit Voice Preset" : "Create Voice Preset"}
          </DialogTitle>
          <DialogDescription className="text-[#9CA3AF]">
            Configure per-provider voice settings for TTS audio generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Common fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[#9CA3AF] mb-1 block">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit && preset?.isSystem}
                placeholder="e.g. Professional Narrator"
                className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#9CA3AF] mb-1 block">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isEdit && preset?.isSystem}
                placeholder="Brief description of this voice style"
                className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
              />
            </div>
          </div>

          {/* OpenAI section */}
          <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-3">
            <h4 className="text-xs font-semibold text-[#F9FAFB]">OpenAI</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
                <Select value={openaiVoice} onValueChange={setOpenaiVoice}>
                  <SelectTrigger className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                    {OPENAI_VOICES.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">
                  Speed ({openaiSpeed}x)
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.05"
                  value={openaiSpeed}
                  onChange={(e) => setOpenaiSpeed(e.target.value)}
                  className="w-full h-1.5 rounded-full accent-[#3B82F6] mt-2"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Instructions</label>
              <Textarea
                value={openaiInstructions}
                onChange={(e) => setOpenaiInstructions(e.target.value)}
                placeholder="Optional voice personality instructions..."
                className="text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] min-h-[60px] resize-none"
              />
            </div>
          </div>

          {/* Groq section */}
          <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold text-[#F9FAFB]">Groq</h4>
            <div>
              <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
              <Input
                value={groqVoice}
                onChange={(e) => setGroqVoice(e.target.value)}
                placeholder="austin"
                className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
              />
            </div>
          </div>

          {/* Cloudflare section */}
          <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-[#F9FAFB]">Cloudflare</h4>
            <p className="text-[10px] text-[#9CA3AF] mt-1">No voice configuration available</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#9CA3AF] text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={saving || !name.trim()}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : isEdit ? "Save Changes" : "Create Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
