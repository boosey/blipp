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

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

interface PipelineControlsProps {
  config: PipelineConfig;
  saving: string | null;
  triggering: boolean;
  onTogglePipeline: (v: boolean) => void;
  onToggleStage: (stage: number, v: boolean) => void;
  onTriggerFeedRefresh: () => void;
  variant: "full" | "master-only" | "stage-only";
  /** Required when variant is "stage-only" */
  stage?: number;
}

/**
 * Master pipeline toggle — used identically on Command Center and Pipeline toolbar.
 * Prominent block with icon, label, Active/Paused status, and green/grey switch.
 */
function MasterPipelineToggle({
  config,
  saving,
  onTogglePipeline,
}: Pick<PipelineControlsProps, "config" | "saving" | "onTogglePipeline">) {
  const on = config.enabled;
  return (
    <div
      className="flex items-center justify-between rounded-lg p-3"
      style={{ backgroundColor: on ? "#10B98115" : "#9CA3AF10" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg"
          style={{ backgroundColor: on ? "#10B98120" : "#9CA3AF15" }}
        >
          <Zap className="h-4 w-4" style={{ color: on ? "#10B981" : "#9CA3AF" }} />
        </div>
        <div>
          <span className="text-sm font-bold text-[#F9FAFB]">Pipeline</span>
          <div className="text-[10px]" style={{ color: on ? "#10B981" : "#9CA3AF" }}>
            {on ? "Active" : "Paused"}
          </div>
        </div>
      </div>
      <Switch
        checked={on}
        onCheckedChange={onTogglePipeline}
        disabled={saving === "pipeline.enabled"}
        style={{ backgroundColor: on ? "#10B981" : "#4B5563" }}
      />
    </div>
  );
}

/** Full variant — master toggle + 5 stage toggles + Run Now. Used on Command Center. */
function FullControls({
  config, saving, triggering, onTogglePipeline, onToggleStage, onTriggerFeedRefresh,
}: Omit<PipelineControlsProps, "variant" | "stage">) {
  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3">
      <MasterPipelineToggle config={config} saving={saving} onTogglePipeline={onTogglePipeline} />

      {/* Stage toggles — vertical with names */}
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5].map((s) => {
          const stage = config.stages[s];
          const color = STAGE_COLORS[s];
          const on = stage?.enabled ?? true;
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
                checked={on}
                onCheckedChange={(v) => onToggleStage(s, v)}
                disabled={saving === `pipeline.stage.${s}.enabled`}
                style={{ backgroundColor: on ? "#10B981" : "#4B5563" }}
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

/** Stage-only variant — single stage toggle inline. Used in Pipeline stage column headers. */
function StageOnlyControls({
  config, saving, onToggleStage, stage,
}: Pick<PipelineControlsProps, "config" | "saving" | "onToggleStage" | "stage">) {
  const s = stage!;
  const stageConfig = config.stages[s];
  const on = stageConfig?.enabled ?? true;
  return (
    <Switch
      size="sm"
      checked={on}
      onCheckedChange={(v) => onToggleStage(s, v)}
      disabled={saving === `pipeline.stage.${s}.enabled`}
      style={{ backgroundColor: on ? "#10B981" : "#4B5563" }}
    />
  );
}

export function PipelineControls(props: PipelineControlsProps) {
  switch (props.variant) {
    case "full":
      return <FullControls {...props} />;
    case "master-only":
      return (
        <MasterPipelineToggle
          config={props.config}
          saving={props.saving}
          onTogglePipeline={props.onTogglePipeline}
        />
      );
    case "stage-only":
      return <StageOnlyControls {...props} />;
  }
}
