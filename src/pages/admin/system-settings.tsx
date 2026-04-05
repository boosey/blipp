import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import type { PlatformConfigEntry } from "@/types/admin";

interface SystemConfigDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  description: string;
  default: number | boolean | string;
  options?: string[];
}

const SYSTEM_CONFIGS: SystemConfigDef[] = [
  { key: "pipeline.logLevel", label: "Pipeline Log Level", type: "select", description: "Controls verbosity of pipeline console output", default: "info", options: ["error", "info", "debug"] },
];

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
    const num = Math.max(1, Number(local) || 1);
    setLocal(String(num));
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
        min={1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        className="w-24 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
      />
      {saving && (
        <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[10px]">…</span>
      )}
      {saved && !saving && (
        <Check className="absolute -right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#14B8A6]" />
      )}
    </div>
  );
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

export default function SystemSettings() {
  const apiFetch = useAdminFetch();
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config");
      setConfigs(res.data.flatMap((g) => g.entries));
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

  function getConfigValue(key: string, defaultValue: number | boolean | string): number | boolean | string {
    const entry = configs.find((c) => c.key === key);
    if (entry?.value == null) return defaultValue;
    if (typeof defaultValue === "boolean") return entry.value === true || entry.value === "true";
    if (typeof defaultValue === "number") return Number(entry.value);
    return String(entry.value);
  }

  if (loading && configs.length === 0) return <SystemSettingsSkeleton />;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">System Settings</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">Global system configuration</p>
      </div>

      <div className="space-y-2">
        {SYSTEM_CONFIGS.map((cfg) => {
          const currentValue = getConfigValue(cfg.key, cfg.default);
          return (
            <div
              key={cfg.key}
              className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-4">
                  <Label className="text-xs text-[#F9FAFB]">{cfg.label}</Label>
                  <p className="text-[10px] text-[#9CA3AF] mt-0.5">{cfg.description}</p>
                </div>

                {cfg.type === "boolean" ? (
                  <Switch
                    checked={currentValue as boolean}
                    onCheckedChange={(v) => updateConfig(cfg.key, v)}
                    disabled={saving === cfg.key}
                    className="data-[state=checked]:bg-[#14B8A6]"
                  />
                ) : cfg.type === "select" && cfg.options ? (
                  <Select
                    value={String(currentValue)}
                    onValueChange={(v) => updateConfig(cfg.key, v)}
                    disabled={saving === cfg.key}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                      {cfg.options.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-xs">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <NumberConfigInput
                    value={currentValue as number}
                    onSave={(val) => updateConfig(cfg.key, val)}
                    saving={saving === cfg.key}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
