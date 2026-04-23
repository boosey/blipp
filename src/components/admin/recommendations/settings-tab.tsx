import { useState, useEffect } from "react";
import { Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFetch } from "@/lib/api-client";
import type { RecommendationConfigItem } from "./types";

export interface SettingsTabProps {
  apiFetch: ReturnType<typeof useAdminFetch>;
}

export function SettingsTab({ apiFetch }: SettingsTabProps) {
  const [config, setConfig] = useState<RecommendationConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, number | boolean>>({});

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: RecommendationConfigItem[] }>("/recommendations/config")
      .then((r) => setConfig(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (config.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
        <Settings className="h-8 w-8 mb-3 opacity-20" />
        <span className="text-xs">No configuration keys found</span>
      </div>
    );
  }

  const hasEdits = Object.keys(edits).length > 0;

  const shortLabel = (key: string) => {
    const parts = key.split(".");
    return parts.slice(1).join(".");
  };

  const isBoolean = (item: RecommendationConfigItem) =>
    typeof item.value === "boolean" ||
    item.key.includes("enabled") ||
    item.key.includes("Enabled");

  const handleSave = () => {
    setSaving(true);
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    apiFetch<{ data: unknown }>("/recommendations/config", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    })
      .then(() => {
        toast.success("Settings saved");
        setConfig((prev) =>
          prev.map((item) =>
            edits[item.key] !== undefined
              ? { ...item, value: edits[item.key], isDefault: false, updatedAt: new Date().toISOString() }
              : item
          )
        );
        setEdits({});
      })
      .catch((err) => toast.error(`Failed to save: ${err.message}`))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9CA3AF]">
          {config.length} configuration keys
        </span>
        <Button
          size="sm"
          disabled={!hasEdits || saving}
          onClick={handleSave}
          className="bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 border border-[#3B82F6]/20 text-xs disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save Changes
        </Button>
      </div>

      <div className="rounded-lg bg-[#0A1628] border border-white/5 divide-y divide-white/5">
        {config.map((item) => {
          const currentVal = edits[item.key] !== undefined ? edits[item.key] : item.value;
          const isBool = isBoolean(item);

          return (
            <div
              key={item.key}
              className="flex items-center gap-4 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#F9FAFB]">
                    {shortLabel(item.key)}
                  </span>
                  {item.isDefault && edits[item.key] === undefined && (
                    <Badge className="bg-white/5 text-[#9CA3AF] text-[9px]">default</Badge>
                  )}
                  {edits[item.key] !== undefined && (
                    <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] text-[9px]">modified</Badge>
                  )}
                </div>
                {item.description && (
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">
                    {item.description}
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {isBool ? (
                  <Switch
                    checked={currentVal as boolean}
                    onCheckedChange={(checked) =>
                      setEdits((prev) => ({ ...prev, [item.key]: checked }))
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    step={item.key.includes("weight") ? 0.05 : 1}
                    min={0}
                    max={item.key.includes("weight") ? 1 : undefined}
                    value={currentVal as number}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [item.key]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-24 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums"
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
