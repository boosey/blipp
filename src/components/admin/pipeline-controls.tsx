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

/** Full variant -- master toggle + 5 stage toggles + Run Now. Used on Command Center. */
function FullControls({
  config, saving, triggering, onTogglePipeline, onToggleStage, onTriggerFeedRefresh,
}: Omit<PipelineControlsProps, "variant" | "stage">) {
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-[#EF4444]" />
        <span className="text-sm font-semibold">Pipeline Controls</span>
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#9CA3AF]">Pipeline Enabled</span>
        <Switch
          size="sm"
          checked={config.enabled}
          onCheckedChange={onTogglePipeline}
          disabled={saving === "pipeline.enabled"}
          className="data-[state=checked]:bg-[#10B981]"
        />
      </div>

      {/* Stage toggles -- compact row */}
      <div className="flex items-center gap-3 flex-wrap">
        {[1, 2, 3, 4, 5].map((s) => {
          const stage = config.stages[s];
          const color = STAGE_COLORS[s];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold"
                style={{ backgroundColor: `${color}20`, color }}
              >
                {s}
              </span>
              <Switch
                size="sm"
                checked={stage?.enabled ?? true}
                onCheckedChange={(v) => onToggleStage(s, v)}
                disabled={saving === `pipeline.stage.${s}.enabled`}
                className="data-[state=checked]:bg-[#3B82F6]"
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

/** Compact variant -- master toggle + Run Now in a horizontal bar. Used in Pipeline toolbar. */
function CompactControls({
  config, saving, onTogglePipeline,
}: Omit<PipelineControlsProps, "variant" | "stage" | "onToggleStage" | "onTriggerFeedRefresh" | "triggering">) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-[#EF4444]" />
        <span className="text-xs text-[#9CA3AF]">Pipeline</span>
        <Switch
          size="sm"
          checked={config.enabled}
          onCheckedChange={onTogglePipeline}
          disabled={saving === "pipeline.enabled"}
          className="data-[state=checked]:bg-[#10B981]"
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
      className="data-[state=checked]:bg-[#3B82F6]"
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
