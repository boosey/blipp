import { useState, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
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
import { useAdminFetch } from "@/lib/api-client";
import type {
  VoicePresetEntry,
  VoicePresetConfig,
  VoiceCharacteristics,
} from "@/types/admin";
import { AudioPreviewButton } from "./audio-preview-button";

export interface TtsChainEntry {
  provider: string;
  model: string;
  providerModelId: string;
}

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

/** Render provider-specific config fields. */
function ProviderConfigFields({
  provider,
  providerConfig,
  onChange,
}: {
  provider: string;
  providerConfig: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  if (provider === "openai") {
    const voice = (providerConfig.voice as string) || "";
    const instructions = (providerConfig.instructions as string) || "";
    const speed = String(providerConfig.speed ?? "1.0");
    return (
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
          <Select value={voice || "nova"} onValueChange={(v) => onChange({ ...providerConfig, voice: v })}>
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
            Speed ({speed}x)
          </label>
          <input
            type="range"
            min="0.25"
            max="4.0"
            step="0.05"
            value={speed}
            onChange={(e) => onChange({ ...providerConfig, speed: parseFloat(e.target.value) })}
            className="w-full h-1.5 rounded-full accent-[#3B82F6] mt-2"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Instructions</label>
          <Textarea
            value={instructions}
            onChange={(e) => onChange({ ...providerConfig, instructions: e.target.value || undefined })}
            placeholder="Optional voice personality instructions..."
            className="text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] min-h-[60px] resize-none"
          />
        </div>
      </div>
    );
  }

  // Generic provider (groq, cloudflare, etc.) — just voice input
  const voice = (providerConfig.voice as string) || "";
  return (
    <div>
      <label className="text-[10px] font-medium text-[#9CA3AF] mb-1 block">Voice</label>
      <Input
        value={voice}
        onChange={(e) => onChange({ ...providerConfig, voice: e.target.value })}
        placeholder="Voice identifier"
        className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
      />
      {!voice.trim() && (
        <p className="text-[10px] text-[#EF4444] mt-1">Voice is required</p>
      )}
    </div>
  );
}

export interface PresetDialogProps {
  open: boolean;
  preset: VoicePresetEntry | null;
  ttsChain: TtsChainEntry[];
  onClose: () => void;
  onSaved: () => void;
  apiFetch: ReturnType<typeof useAdminFetch>;
}

export function PresetDialog({ open, preset, ttsChain, onClose, onSaved, apiFetch }: PresetDialogProps) {
  const isEdit = !!preset;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [providerConfigs, setProviderConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState(false);
  const [characteristics, setCharacteristics] = useState<VoiceCharacteristics>({});

  useEffect(() => {
    if (open) {
      if (preset) {
        setName(preset.name);
        setDescription(preset.description ?? "");
        setCharacteristics(preset.voiceCharacteristics ?? {});
        // Load existing config for each provider
        const configs: Record<string, Record<string, unknown>> = {};
        for (const entry of ttsChain) {
          const existing = (preset.config as Record<string, unknown>)?.[entry.provider];
          configs[entry.provider] = (existing as Record<string, unknown>) ?? getProviderDefaults(entry.provider);
        }
        setProviderConfigs(configs);
      } else {
        setName("");
        setDescription("");
        setCharacteristics({});
        const configs: Record<string, Record<string, unknown>> = {};
        for (const entry of ttsChain) {
          configs[entry.provider] = getProviderDefaults(entry.provider);
        }
        setProviderConfigs(configs);
      }
    }
  }, [open, preset, ttsChain]);

  const currentConfig: VoicePresetConfig = { ...providerConfigs };

  // Check each chain provider has a voice configured
  const allVoicesSet = ttsChain.every((entry) => {
    const pc = providerConfigs[entry.provider];
    return pc && (pc.voice as string)?.trim();
  });
  const isValid = name.trim() && allVoicesSet;

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
            A voice preset defines how each TTS provider should sound. Configure a voice for
            each active provider in your TTS chain — the pipeline uses whichever provider is
            selected for the audio generation stage.
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

          {/* Provider columns — driven by TTS chain */}
          {ttsChain.length === 0 ? (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#EF4444] shrink-0" />
              <p className="text-xs text-[#EF4444]">
                No TTS models configured. Add a TTS model in Configuration before creating voice presets.
              </p>
            </div>
          ) : (
            <div className={`grid gap-4 ${ttsChain.length === 1 ? "grid-cols-1" : ttsChain.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {ttsChain.map((entry) => {
                const pc = providerConfigs[entry.provider] ?? {};
                return (
                  <div key={entry.provider} className="bg-[#0A1628]/50 border border-white/5 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-[#F9FAFB] capitalize">{entry.provider}</h4>
                        <p className="text-[10px] text-[#9CA3AF]">{entry.providerModelId}</p>
                      </div>
                      <AudioPreviewButton provider={entry.provider} config={currentConfig} />
                    </div>
                    <ProviderConfigFields
                      provider={entry.provider}
                      providerConfig={pc}
                      onChange={(updated) =>
                        setProviderConfigs((prev) => ({ ...prev, [entry.provider]: updated }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-[#9CA3AF] text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={saving || !isValid || ttsChain.length === 0}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : isEdit ? "Save Changes" : "Create Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getProviderDefaults(provider: string): Record<string, unknown> {
  if (provider === "openai") return { voice: "nova", speed: 1.0 };
  if (provider === "groq") return { voice: "austin" };
  return { voice: "" };
}
