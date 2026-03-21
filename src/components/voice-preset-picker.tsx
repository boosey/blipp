import { useFetch } from "../lib/use-fetch";
import { Skeleton } from "./ui/skeleton";
import type { VoicePresetOption } from "../types/admin";

interface VoicePresetPickerProps {
  selected: string | null;
  onSelect: (presetId: string | null) => void;
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
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            selected === preset.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          title={preset.description ?? undefined}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}
