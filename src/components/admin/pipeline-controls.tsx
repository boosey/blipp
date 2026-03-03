import { Zap, Play, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { PipelineConfig } from "@/types/admin";

const STAGE_COLORS: Record<number, string> = {
  1: "#3B82F6",
  2: "#8B5CF6",
  3: "#F59E0B",
  4: "#10B981",
  5: "#14B8A6",
};

interface PipelineControlsProps {
  config: PipelineConfig;
  saving: string | null;
  triggering: boolean;
  onTogglePipeline: (v: boolean) => void;
  onToggleStage: (stage: number, v: boolean) => void;
  onTriggerFeedRefresh: () => void;
  variant: "full" | "compact" | "stage-only";
  /** Required when variant is "stage-only" */
  stage?: number;
}

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

/** Full variant -- master toggle + 5 stage toggles + Run Now. Used on Command Center. */
function FullControls({
  config, saving, triggering, onTogglePipeline, onToggleStage, onTriggerFeedRefresh,
}: Omit<PipelineControlsProps, "variant" | "stage">) {
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      {/* Master toggle — prominent */}
      <div className="flex items-center justify-between rounded-lg p-3" style={{ backgroundColor: config.enabled ? "#10B98115" : "#9CA3AF10" }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg" style={{ backgroundColor: config.enabled ? "#10B98120" : "#9CA3AF15" }}>
            <Zap className="h-4 w-4" style={{ color: config.enabled ? "#10B981" : "#9CA3AF" }} />
          </div>
          <div>
            <span className="text-sm font-bold text-[#F9FAFB]">Pipeline</span>
            <div className="text-[10px]" style={{ color: config.enabled ? "#10B981" : "#9CA3AF" }}>
              {config.enabled ? "Active" : "Paused"}
            </div>
          </div>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={onTogglePipeline}
          disabled={saving === "pipeline.enabled"}
          className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
        />
      </div>

      {/* Stage toggles — vertical with names */}
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5].map((s) => {
          const stage = config.stages[s];
          const color = STAGE_COLORS[s];
          return (
            <div key={s} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {s}
                </span>
                <span className="text-xs text-[#F9FAFB]">{STAGE_NAMES[s]}</span>
              </div>
              <Switch
                size="sm"
                checked={stage?.enabled ?? true}
                onCheckedChange={(v) => onToggleStage(s, v)}
                disabled={saving === `pipeline.stage.${s}.enabled`}
                className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
              />
            </div>
          );
        })}
      </div>

      {/* Run Now */}
      <Button
        size="sm"
        onClick={onTriggerFeedRefresh}
        disabled={triggering || !config.enabled}
        className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
      >
        {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {triggering ? "Running..." : "Run Now"}
      </Button>
    </div>
  );
}

/** Compact variant -- master toggle in a horizontal bar. Used in Pipeline toolbar. */
function CompactControls({
  config, saving, onTogglePipeline,
}: Omit<PipelineControlsProps, "variant" | "stage" | "onToggleStage" | "onTriggerFeedRefresh" | "triggering">) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1" style={{ backgroundColor: config.enabled ? "#10B98110" : "#9CA3AF08" }}>
        <Zap className="h-3.5 w-3.5" style={{ color: config.enabled ? "#10B981" : "#9CA3AF" }} />
        <span className="text-xs font-semibold text-[#F9FAFB]">Pipeline</span>
        <span className="text-[10px]" style={{ color: config.enabled ? "#10B981" : "#9CA3AF" }}>
          {config.enabled ? "On" : "Off"}
        </span>
        <Switch
          size="sm"
          checked={config.enabled}
          onCheckedChange={onTogglePipeline}
          disabled={saving === "pipeline.enabled"}
          className="ml-1 data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
        />
      </div>
    </div>
  );
}

/** Stage-only variant -- single stage toggle inline. Used in Pipeline stage column headers. */
function StageOnlyControls({
  config, saving, onToggleStage, stage,
}: Pick<PipelineControlsProps, "config" | "saving" | "onToggleStage" | "stage">) {
  const s = stage!;
  const stageConfig = config.stages[s];
  return (
    <Switch
      size="sm"
      checked={stageConfig?.enabled ?? true}
      onCheckedChange={(v) => onToggleStage(s, v)}
      disabled={saving === `pipeline.stage.${s}.enabled`}
      className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-[#4B5563]"
    />
  );
}

export function PipelineControls(props: PipelineControlsProps) {
  switch (props.variant) {
    case "full":
      return <FullControls {...props} />;
    case "compact":
      return <CompactControls {...props} />;
    case "stage-only":
      return <StageOnlyControls {...props} />;
  }
}
