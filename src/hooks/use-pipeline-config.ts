import { useState, useCallback, useEffect } from "react";
import { useAdminFetch } from "@/lib/admin-api";
import type { PlatformConfigEntry, PipelineConfig, PipelineTriggerResult } from "@/types/admin";

export const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

export function buildPipelineConfig(configs: PlatformConfigEntry[]): PipelineConfig {
  const get = (key: string) => configs.find((c) => c.key === key)?.value;
  return {
    enabled: get("pipeline.enabled") === true || get("pipeline.enabled") === "true",
    minIntervalMinutes: Number(get("pipeline.minIntervalMinutes")) || 60,
    lastAutoRunAt: (get("pipeline.lastAutoRunAt") as string) ?? null,
    stages: {
      1: { enabled: get("pipeline.stage.1.enabled") !== false && get("pipeline.stage.1.enabled") !== "false", name: STAGE_NAMES[1] },
      2: { enabled: get("pipeline.stage.2.enabled") !== false && get("pipeline.stage.2.enabled") !== "false", name: STAGE_NAMES[2] },
      3: { enabled: get("pipeline.stage.3.enabled") !== false && get("pipeline.stage.3.enabled") !== "false", name: STAGE_NAMES[3] },
      4: { enabled: get("pipeline.stage.4.enabled") !== false && get("pipeline.stage.4.enabled") !== "false", name: STAGE_NAMES[4] },
      5: { enabled: get("pipeline.stage.5.enabled") !== false && get("pipeline.stage.5.enabled") !== "false", name: STAGE_NAMES[5] },
    },
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
      const res = await apiFetch<{ data: PlatformConfigEntry[] }>("/config");
      setConfigs(res.data);
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
    (stage: number, v: boolean) => updateConfig(`pipeline.stage.${stage}.enabled`, v),
    [updateConfig]
  );

  const triggerFeedRefresh = useCallback(async () => {
    setTriggering(true);
    try {
      await apiFetch<PipelineTriggerResult>("/pipeline/trigger/feed-refresh", { method: "POST" });
    } catch (e) {
      console.error("Failed to trigger pipeline:", e);
    } finally {
      setTriggering(false);
    }
  }, [apiFetch]);

  return {
    config,
    configs,      // raw entries (for Configuration page to keep using)
    loading,
    saving,
    triggering,
    updateConfig, // generic (for Configuration page interval selector)
    togglePipeline,
    toggleStage,
    triggerFeedRefresh,
    reload: load,
  };
}
