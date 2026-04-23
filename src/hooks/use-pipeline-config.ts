import { useState, useCallback, useEffect } from "react";
import { useAdminFetch } from "@/lib/api-client";
import type { PlatformConfigEntry, PipelineConfig } from "@/types/admin";

export const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};

export function buildPipelineConfig(configs: PlatformConfigEntry[]): PipelineConfig {
  const get = (key: string) => configs.find((c) => c.key === key)?.value;
  const stages: Record<string, { enabled: boolean; name: string }> = {};
  for (const [key, name] of Object.entries(STAGE_NAMES)) {
    const val = get(`pipeline.stage.${key}.enabled`);
    stages[key] = { enabled: val !== false && val !== "false", name };
  }
  return {
    enabled: get("pipeline.enabled") === true || get("pipeline.enabled") === "true",
    stages,
  };
}

export function usePipelineConfig() {
  const apiFetch = useAdminFetch();
  const [configs, setConfigs] = useState<PlatformConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    try {
      // Fetch unowned keys (pipeline.enabled, etc.) and stage-owned keys
      // (pipeline.stage.*.enabled) in parallel — both are needed here.
      const [baseRes, stageRes] = await Promise.all([
        apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config"),
        apiFetch<{ data: { category: string; entries: PlatformConfigEntry[] }[] }>("/config?owner=stage-configuration"),
      ]);
      const flat = [
        ...baseRes.data.flatMap((group) => group.entries),
        ...stageRes.data.flatMap((group) => group.entries),
      ];
      setConfigs(flat);
    } catch (e) {
      console.error("Failed to load pipeline config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const config = buildPipelineConfig(configs);

  const updateConfig = useCallback(async (key: string, value: unknown) => {
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
  }, [apiFetch, load]);

  const togglePipeline = useCallback(
    (v: boolean) => updateConfig("pipeline.enabled", v),
    [updateConfig]
  );

  const toggleStage = useCallback(
    (stage: string, v: boolean) => updateConfig(`pipeline.stage.${stage}.enabled`, v),
    [updateConfig]
  );

  const triggerTestBriefing = useCallback(
    async (podcastIds: string[], targetMinutes: number) => {
      setTriggering(true);
      try {
        const res = await apiFetch<{ data: unknown }>("/requests/test-briefing", {
          method: "POST",
          body: JSON.stringify({ podcastIds, targetMinutes }),
        });
        return res.data;
      } catch (e) {
        console.error("Failed to create test briefing:", e);
        return null;
      } finally {
        setTriggering(false);
      }
    },
    [apiFetch]
  );

  return {
    config,
    configs,      // raw entries (for Configuration page to keep using)
    loading,
    saving,
    triggering,
    updateConfig, // generic (for Configuration page interval selector)
    togglePipeline,
    toggleStage,
    triggerTestBriefing,
    reload: load,
  };
}
