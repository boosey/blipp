import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { PipelineConfig } from "@/types/admin";

const STAGE_COLORS: Record<string, string> = {
  TRANSCRIPTION: "#8B5CF6",
  DISTILLATION: "#F59E0B",
  NARRATIVE_GENERATION: "#10B981",
  AUDIO_GENERATION: "#06B6D4",
  BRIEFING_ASSEMBLY: "#14B8A6",
};

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};

interface PipelineControlsProps {
  config: PipelineConfig;
  saving: string | null;
  onTogglePipeline: (v: boolean) => void;
  onToggleStage: (stage: string, v: boolean) => void;
  variant: "full" | "master-only" | "stage-only";
  /** Required when variant is "stage-only" */
  stage?: string;
  /** Extra classes for outer wrapper (e.g. h-full for grid layouts) */
  className?: string;
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
      className="flex items-center justify-between gap-6 rounded-lg p-3"
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

/** Full variant — master toggle + 5 stage toggles. Used on Command Center. */
function FullControls({
  config, saving, onTogglePipeline, onToggleStage, className,
}: Omit<PipelineControlsProps, "variant" | "stage">) {
  return (
    <div className={cn("rounded-lg bg-[#1A2942] border border-white/5 p-4 space-y-3", className)}>
      <div className="widget-drag-handle flex items-center gap-2 -mt-1 mb-1">
        <Zap className="h-4 w-4 text-[#F59E0B]" />
        <span className="text-sm font-semibold">Pipeline Controls</span>
      </div>
      <MasterPipelineToggle config={config} saving={saving} onTogglePipeline={onTogglePipeline} />

      {/* Stage toggles — vertical with names */}
      <div className="space-y-1.5">
        {Object.entries(STAGE_NAMES).map(([key, name], idx) => {
          const stage = config.stages[key];
          const color = STAGE_COLORS[key];
          const on = stage?.enabled ?? true;
          return (
            <div key={key} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {idx + 1}
                </span>
                <span className="text-xs text-[#F9FAFB]">{name}</span>
              </div>
              <Switch
                size="sm"
                checked={on}
                onCheckedChange={(v) => onToggleStage(key, v)}
                disabled={saving === `pipeline.stage.${key}.enabled`}
                style={{ backgroundColor: on ? "#10B981" : "#4B5563" }}
              />
            </div>
          );
        })}
      </div>

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
