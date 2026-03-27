import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StageModel {
  provider: string;
  providerLabel: string;
  providerModelId: string | null;
  model: string;
  label: string;
}

interface TierDef {
  key: string;
  label: string;
  configSuffix: string;
}

export interface ModelTierSelectorProps {
  stageKey: string;
  tiers: readonly TierDef[];
  stageModels: StageModel[];
  getConfigByKey: (key: string) => { provider: string; model: string } | null;
  saving: string | null;
  onTierChange: (configKey: string, compositeKey: string) => void;
}

export function ModelTierSelector({
  stageKey,
  tiers,
  stageModels,
  getConfigByKey,
  saving,
  onTierChange,
}: ModelTierSelectorProps) {
  return (
    <div className="bg-[#1A2942] rounded-lg p-4 space-y-3">
      <span className="text-xs font-semibold text-[#F9FAFB]">Models</span>
      <div className="space-y-2">
        {tiers.map((tier, tierIdx) => {
          const configKey = `ai.${stageKey}.model${tier.configSuffix}`;
          const tierCfg = getConfigByKey(configKey);
          const tierSaving = saving === configKey;
          const isPrimary = tier.key === "primary";
          const selectedAbove = new Set(
            tiers
              .slice(0, tierIdx)
              .map((t) => {
                const cfg = getConfigByKey(`ai.${stageKey}.model${t.configSuffix}`);
                return cfg ? `${cfg.provider}::${cfg.model}` : null;
              })
              .filter(Boolean) as string[]
          );
          const availableModels = stageModels.filter(
            (m) => !selectedAbove.has(`${m.provider}::${m.model}`)
          );
          return (
            <div key={tier.key} className="space-y-1">
              <span className={cn(
                "text-[10px] capitalize",
                isPrimary ? "text-[#F9FAFB] font-medium" : "text-[#9CA3AF]"
              )}>
                {tier.label}
              </span>
              <Select
                value={tierCfg ? `${tierCfg.provider}::${tierCfg.model}` : "__none__"}
                onValueChange={(v) => onTierChange(configKey, v)}
                disabled={tierSaving}
              >
                <SelectTrigger className={cn(
                  "bg-[#0F1D32] border-white/10 text-[#F9FAFB]",
                  isPrimary ? "h-8 text-xs" : "h-7 text-[10px]"
                )}>
                  <SelectValue placeholder={isPrimary ? "Select a model..." : "None (disabled)"} />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
                  {!isPrimary && (
                    <SelectItem value="__none__" className="text-[10px] text-[#6B7280]">
                      None (disabled)
                    </SelectItem>
                  )}
                  {availableModels.map((m) => (
                    <SelectItem
                      key={`${m.provider}::${m.model}`}
                      value={`${m.provider}::${m.model}`}
                      className={isPrimary ? "text-xs" : "text-[10px]"}
                    >
                      <span>{m.label} ({m.providerLabel})</span>
                      {m.providerModelId && (
                        <span className="ml-1.5 font-mono text-[#6B7280]">{m.providerModelId}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
