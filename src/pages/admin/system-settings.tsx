import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useAdminFetch } from "@/lib/admin-api";
import type { PlatformConfigEntry } from "@/types/admin";

/** Number input that holds local state and saves on blur to avoid focus loss. */
function NumberConfigInput({
  value,
  onSave,
  saving,
}: {
  value: number;
  onSave: (val: number) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setLocal(String(value));
      prevValue.current = value;
    }
  }, [value]);

  const commit = () => {
    const num = Number(local);
    if (isNaN(num)) { setLocal(String(value)); return; }
    if (num !== value) {
      onSave(num);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className="relative">
      <Input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-32 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
      />
      {saving && <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[10px]">…</span>}
      {saved && !saving && <Check className="absolute -right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#14B8A6]" />}
    </div>
  );
}

/** Text input that holds local state and saves on blur. */
function TextConfigInput({
  value,
  onSave,
  saving,
}: {
  value: string;
  onSave: (val: string) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setLocal(value);
      prevValue.current = value;
    }
  }, [value]);

  const commit = () => {
    if (local !== value) {
      onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className="relative flex-1 max-w-xs">
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono"
      />
      {saving && <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[10px]">…</span>}
      {saved && !saving && <Check className="absolute -right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#14B8A6]" />}
    </div>
  );
}

/** Infer the editor type from the value. */
function inferType(value: unknown): "boolean" | "number" | "string" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") return "number";
  return "string";
}

/** Format a key like "geoClassification.llmBatchSize" → "LLM Batch Size" */
function keyToLabel(key: string): string {
  const parts = key.split(".");
  const last = parts[parts.length - 1];
  return last
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Format a category prefix like "geoClassification" → "Geo Classification" */
function categoryLabel(cat: string): string {
  return cat
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function SystemSettingsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      <Skeleton className="h-4 w-80 bg-white/5" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

interface ConfigGroup {
  category: string;
  entries: PlatformConfigEntry[];
}

export default function SystemSettings() {
  const apiFetch = useAdminFetch();
  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ConfigGroup[] }>("/config");
      setGroups(res.data);
    } catch (e) {
      console.error("Failed to load config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const updateConfig = useCallback(
    async (key: string, value: unknown) => {
      setSaving(key);
      try {
        await apiFetch(`/config/${key}`, {
          method: "PATCH",
          body: JSON.stringify({ value }),
        });
        await load();
      } catch (e) {
        console.error("Failed to update config:", e);
      } finally {
        setSaving(null);
      }
    },
    [apiFetch, load]
  );

  if (loading && groups.length === 0) return <SystemSettingsSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">System Settings</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">All platform configuration — changes take effect immediately</p>
      </div>

      {groups.map((group) => (
        <div key={group.category} className="space-y-2">
          <h3 className="text-sm font-semibold text-[#F9FAFB]/80">{categoryLabel(group.category)}</h3>
          <div className="space-y-1.5">
            {group.entries.map((entry) => {
              const type = inferType(entry.value);

              return (
                <div
                  key={entry.key}
                  className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs text-[#F9FAFB]">{keyToLabel(entry.key)}</Label>
                      {entry.description && (
                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{entry.description}</p>
                      )}
                      <p className="text-[9px] text-[#9CA3AF]/50 font-mono mt-0.5">{entry.key}</p>
                    </div>

                    {type === "boolean" ? (
                      <Switch
                        checked={entry.value === true || entry.value === "true"}
                        onCheckedChange={(v) => updateConfig(entry.key, v)}
                        disabled={saving === entry.key}
                        className="data-[state=checked]:bg-[#14B8A6]"
                      />
                    ) : type === "number" ? (
                      <NumberConfigInput
                        value={Number(entry.value)}
                        onSave={(val) => updateConfig(entry.key, val)}
                        saving={saving === entry.key}
                      />
                    ) : (
                      <TextConfigInput
                        value={String(entry.value)}
                        onSave={(val) => updateConfig(entry.key, val)}
                        saving={saving === entry.key}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {groups.length === 0 && !loading && (
        <p className="text-sm text-[#9CA3AF] py-8 text-center">No configuration entries found</p>
      )}
    </div>
  );
}
