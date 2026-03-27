import { useState, useRef } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/clerk-react";
import { getApiBase } from "@/lib/api-base";
import type { VoicePresetConfig } from "@/types/admin";

export interface AudioPreviewButtonProps {
  provider: string;
  config: VoicePresetConfig;
}

export function AudioPreviewButton({ provider, config }: AudioPreviewButtonProps) {
  const { getToken } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }

    // Extract provider-specific fields for the preview API
    const providerConfig = config[provider] as Record<string, unknown> | undefined;
    const voice = (providerConfig?.voice as string) || "";
    if (!voice) {
      toast.error("Select a voice before previewing");
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = { provider, voice };
      if (providerConfig?.instructions) body.instructions = providerConfig.instructions;
      if (providerConfig?.speed != null) body.speed = providerConfig.speed;

      const res = await fetch(
        `${getApiBase()}/api/admin/voice-presets/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as any).error || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      await audio.play();
      setPlaying(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePreview}
      disabled={loading}
      className="text-[#9CA3AF] hover:text-[#F9FAFB] text-xs gap-1"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : playing ? (
        <Square className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      Preview
    </Button>
  );
}
