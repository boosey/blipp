import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type {
  VoicePresetEntry,
  VoicePresetConfig,
  VoiceCharacteristics,
} from "@/types/admin";
import { AudioPreviewButton } from "./audio-preview-button";

const OPENAI_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "nova", "onyx", "sage", "shimmer", "verse",
] as const;

const GENDER_OPTIONS = ["female", "male", "neutral"] as const;
const TONE_OPTIONS = ["warm", "calm", "energetic", "neutral"] as const;
const PACE_OPTIONS = ["steady", "fast", "slow"] as const;

function CharacteristicsSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">{label}</label>
      <Select
        value={value ?? "none"}
        onValueChange={(v) => onChange(v === "none" ? undefined : (v as T))}
      >
        <SelectTrigger className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
          <SelectItem value="none" className="text-xs text-[#9CA3AF]">--</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs capitalize">{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface PresetDialogProps {
  open: boolean;
  preset: VoicePresetEntry | null;
  onClose: () => void;
  onSaved: () => void;
  apiFetch: ReturnType<typeof useAdminFetch>;
}

export function PresetDialog({ open, preset, onClose, onSaved, apiFetch }: PresetDialogProps) {
  const isEdit = !!preset;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openaiVoice, setOpenaiVoice] = useState("nova");
  const [openaiInstructions, setOpenaiInstructions] = useState("");
  const [openaiSpeed, setOpenaiSpeed] = useState("1.0");
  const [groqVoice, setGroqVoice] = useState("austin");
  const [saving, setSaving] = useState(false);
  const [characteristics, setCharacteristics] = useState<VoiceCharacteristics>({});

  useEffect(() => {
    if (open) {
      if (preset) {
        setName(preset.name);
        setDescription(preset.description ?? "");
        setOpenaiVoice(preset.config.openai?.voice ?? "nova");
        setOpenaiInstructions(preset.config.openai?.instructions ?? "");
        setOpenaiSpeed(String(preset.config.openai?.speed ?? 1.0));
        setGroqVoice(preset.config.groq?.voice ?? "austin");
        setCharacteristics(preset.voiceCharacteristics ?? {});
      } else {
        setName("");
        setDescription("");
        setOpenaiVoice("nova");
        setOpenaiInstructions("");
        setOpenaiSpeed("1.0");
        setGroqVoice("austin");
        setCharacteristics({});
      }
    }
  }, [open, preset]);

  const isValid = name.trim() && openaiVoice.trim() && groqVoice.trim();

  const currentConfig: VoicePresetConfig = {
    openai: {
      voice: openaiVoice,
      instructions: openaiInstructions || undefined,
      speed: parseFloat(openaiSpeed) || 1.0,
    },
    groq: { voice: groqVoice },
    cloudflare: {},
  };

  const submit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const cleanCharacteristics = Object.fromEntries(
        Object.entries(characteristics).filter(([, v]) => v != null)
      );
      if (isEdit) {
        const body: Record<string, unknown> = {
          config: currentConfig,
          voiceCharacteristics: Object.keys(cleanCharacteristics).length > 0 ? cleanCharacteristics : null,
        };
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
          body: JSON.stringify({
            name,
            description: description || null,
            config: currentConfig,
            voiceCharacteristics: Object.keys(cleanCharacteristics).length > 0 ? cleanCharacteristics : null,
          }),
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
      <DialogContent className="bg-[#0F1D32] border-white/10 sm:max-w-2xl">
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
          <div className="grid grid-cols-2 gap-3">
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

          {/* Voice Characteristics */}
          <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold text-[#F9FAFB]">Voice Characteristics</h4>
            <div className="grid grid-cols-3 gap-3">
              <CharacteristicsSelect
                label="Gender"
                value={characteristics.gender}
                options={GENDER_OPTIONS}
                onChange={(v) => setCharacteristics((c) => ({ ...c, gender: v }))}
              />
              <CharacteristicsSelect
                label="Tone"
                value={characteristics.tone}
                options={TONE_OPTIONS}
                onChange={(v) => setCharacteristics((c) => ({ ...c, tone: v }))}
              />
              <CharacteristicsSelect
                label="Pace"
                value={characteristics.pace}
                options={PACE_OPTIONS}
                onChange={(v) => setCharacteristics((c) => ({ ...c, pace: v }))}
              />
            </div>
          </div>

          {/* Side-by-side provider columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* OpenAI */}
            <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#F9FAFB]">OpenAI</h4>
                <AudioPreviewButton provider="openai" config={currentConfig} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
                <Select value={openaiVoice} onValueChange={setOpenaiVoice}>
                  <SelectTrigger className={`h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] ${!openaiVoice.trim() ? "border-[#EF4444]/50" : ""}`}>
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

            {/* Groq */}
            <div className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#F9FAFB]">Groq</h4>
                <AudioPreviewButton provider="groq" config={currentConfig} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
                <Input
                  value={groqVoice}
                  onChange={(e) => setGroqVoice(e.target.value)}
                  placeholder="austin"
                  className={`h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] ${!groqVoice.trim() ? "border-[#EF4444]/50" : ""}`}
                />
                {!groqVoice.trim() && (
                  <p className="text-[10px] text-[#EF4444] mt-1">Voice is required</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#9CA3AF] text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={saving || !isValid}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : isEdit ? "Save Changes" : "Create Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
