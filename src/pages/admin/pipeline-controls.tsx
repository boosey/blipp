import {
  Zap,
  Play,
  Loader2,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePipelineConfig, STAGE_NAMES } from "@/hooks/use-pipeline-config";

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "360", label: "6 hours" },
  { value: "720", label: "12 hours" },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PipelineControlsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      <Skeleton className="h-4 w-72 bg-white/5" />
      <Skeleton className="h-48 bg-white/5 rounded-lg" />
      <Skeleton className="h-64 bg-white/5 rounded-lg" />
      <Skeleton className="h-16 bg-white/5 rounded-lg" />
    </div>
  );
}

export default function PipelineControls() {
  const {
    config: pipelineConfig,
    configs,
    loading,
    saving,
    triggering,
    updateConfig,
    togglePipeline,
    toggleStage,
    triggerFeedRefresh,
  } = usePipelineConfig();

  if (loading && configs.length === 0) return <PipelineControlsSkeleton />;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">Pipeline Controls</h2>
        <p className="text-xs text-[#9CA3AF] mt-0.5">Master pipeline settings and manual triggers</p>
      </div>

      {/* Master toggle + interval */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#EF4444]/10">
              <Zap className="h-4 w-4 text-[#EF4444]" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#F9FAFB]">Pipeline Enabled</span>
              <div className="text-[10px] text-[#9CA3AF]">Master switch for automated processing</div>
            </div>
          </div>
          <Switch
            checked={pipelineConfig.enabled}
            onCheckedChange={(v) => togglePipeline(v)}
            disabled={saving === "pipeline.enabled"}
            className="data-[state=checked]:bg-[#10B981]"
          />
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Auto-run Interval</Label>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Minimum time between scheduled runs</div>
          </div>
          <Select
            value={String(pipelineConfig.minIntervalMinutes)}
            onValueChange={(v) => updateConfig("pipeline.minIntervalMinutes", Number(v))}
            disabled={saving === "pipeline.minIntervalMinutes"}
          >
            <SelectTrigger className="w-36 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9CA3AF]">Last Auto-run</span>
          <span className="font-mono tabular-nums text-[#F9FAFB]">{relativeTime(pipelineConfig.lastAutoRunAt)}</span>
        </div>
      </div>

      {/* Per-stage toggles */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-3">
        <div>
          <span className="text-xs font-semibold text-[#F9FAFB]">Stage Toggles</span>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Enable or disable individual pipeline stages</p>
        </div>

        {Object.entries(STAGE_NAMES).map(([key, name], idx) => {
          const stageConfig = pipelineConfig.stages[key];
          return (
            <div key={key} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
                >
                  {idx + 1}
                </span>
                <span className="text-xs text-[#F9FAFB]">{stageConfig?.name ?? name}</span>
              </div>
              <Switch
                checked={stageConfig?.enabled ?? true}
                onCheckedChange={(v) => toggleStage(key, v)}
                disabled={saving === `pipeline.stage.${key}.enabled`}
                className="data-[state=checked]:bg-[#3B82F6]"
              />
            </div>
          );
        })}
      </div>

      {/* Max Episodes per Podcast */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Max Episodes per Podcast</Label>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
              Limit how many episodes are ingested per podcast during feed refresh
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={50}
            value={
              (() => {
                const entry = configs.find((c) => c.key === "pipeline.feedRefresh.maxEpisodesPerPodcast");
                return entry?.value != null ? Number(entry.value) : 5;
              })()
            }
            onChange={(e) => {
              const val = Math.min(50, Math.max(1, Number(e.target.value)));
              updateConfig("pipeline.feedRefresh.maxEpisodesPerPodcast", val);
            }}
            disabled={saving === "pipeline.feedRefresh.maxEpisodesPerPodcast"}
            className="w-20 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
          />
        </div>
      </div>

      {/* Log Level */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Pipeline Log Level</Label>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
              Controls verbosity of pipeline console output
            </p>
          </div>
          <Select
            value={
              (() => {
                const entry = configs.find((c) => c.key === "pipeline.logLevel");
                return (entry?.value as string) ?? "info";
              })()
            }
            onValueChange={(v) => updateConfig("pipeline.logLevel", v)}
            disabled={saving === "pipeline.logLevel"}
          >
            <SelectTrigger className="w-28 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
              <SelectItem value="error" className="text-xs">Error</SelectItem>
              <SelectItem value="info" className="text-xs">Info</SelectItem>
              <SelectItem value="debug" className="text-xs">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Request Archiving */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#8B5CF6]/10">
              <Archive className="h-4 w-4 text-[#8B5CF6]" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#F9FAFB]">Request Archiving</span>
              <div className="text-[10px] text-[#9CA3AF]">Delete completed/failed requests older than retention period (runs daily)</div>
            </div>
          </div>
          <Switch
            checked={Boolean(configs.find((c) => c.key === "requests.archiving.enabled")?.value)}
            onCheckedChange={(v) => updateConfig("requests.archiving.enabled", v)}
            disabled={saving === "requests.archiving.enabled"}
            className="data-[state=checked]:bg-[#8B5CF6]"
          />
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-[#F9FAFB]">Retention Days</Label>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Requests older than this are permanently deleted</div>
          </div>
          <Input
            type="number"
            min={1}
            max={365}
            value={(() => {
              const entry = configs.find((c) => c.key === "requests.archiving.maxAgeDays");
              return entry?.value != null ? Number(entry.value) : 30;
            })()}
            onChange={(e) => {
              const val = Math.min(365, Math.max(1, Number(e.target.value)));
              updateConfig("requests.archiving.maxAgeDays", val);
            }}
            disabled={saving === "requests.archiving.maxAgeDays"}
            className="w-20 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB] font-mono tabular-nums text-center"
          />
        </div>

        <Separator className="bg-white/5" />

        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9CA3AF]">Last Run</span>
          <span className="font-mono tabular-nums text-[#F9FAFB]">
            {relativeTime(configs.find((c) => c.key === "requests.archiving.lastRunAt")?.value as string | null)}
          </span>
        </div>
      </div>

      {/* Manual Run */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#F9FAFB]">Manual Run</span>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Trigger a feed refresh cycle now</p>
          </div>
          <Button
            size="sm"
            onClick={triggerFeedRefresh}
            disabled={triggering}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs gap-1.5"
          >
            {triggering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {triggering ? "Running..." : "Run Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
