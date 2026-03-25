import { useState, useRef } from "react";
import { Play, Square, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/clerk-react";
import { useFetch } from "../lib/use-fetch";
import { getApiBase } from "../lib/api-base";
import { Skeleton } from "./ui/skeleton";
import type { VoicePresetOption } from "../types/admin";

interface VoicePresetPickerProps {
  selected: string | null;
  onSelect: (presetId: string | null) => void;
}

function PreviewButton({ presetId }: { presetId: string }) {
  const { getToken } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${getApiBase()}/api/voice-presets/${presetId}/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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
    <button
      onClick={handlePreview}
      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Preview voice"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : playing ? (
        <Square className="w-3 h-3" />
      ) : (
        <Play className="w-3 h-3" />
      )}
    </button>
  );
}

export function VoicePresetPicker({ selected, onSelect }: VoicePresetPickerProps) {
  const { data, loading } = useFetch<{ data: VoicePresetOption[] }>("/voice-presets");
  const presets = data?.data ?? [];

  if (loading) {
    return (
      <div className="flex gap-1.5">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-18 rounded-full" />
      </div>
    );
  }

  if (presets.length === 0) {
    return <p className="text-xs text-muted-foreground">No voice presets available</p>;
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelect(selected === preset.id ? null : preset.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            selected === preset.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          title={preset.description ?? undefined}
        >
          {preset.name}
          {preset.description && (
            <span className="text-[10px] opacity-60 max-w-[100px] truncate hidden sm:inline">
              {preset.description}
            </span>
          )}
          <PreviewButton presetId={preset.id} />
        </button>
      ))}
    </div>
  );
}
