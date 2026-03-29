import { Check, X, Infinity, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AdminPlan, VoicePresetEntry } from "@/types/admin";
import { formatDollars } from "./helpers";

export interface PlanCardProps {
  plan: AdminPlan;
  voicePresets: VoicePresetEntry[];
  togglingId: string | null;
  onToggleActive: (plan: AdminPlan, active: boolean) => void;
  onEdit: (plan: AdminPlan) => void;
  onDelete: (plan: AdminPlan) => void;
}

export function PlanCard({
  plan,
  voicePresets,
  togglingId,
  onToggleActive,
  onEdit,
  onDelete,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        "bg-[#0F1D32] border rounded-xl p-6 transition-colors",
        !plan.active && "opacity-50",
        plan.highlighted ? "border-[#F59E0B]/30" : "border-white/5"
      )}
    >
      {/* Header: name + badges + actions */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-[#F9FAFB]">{plan.name}</span>
            {plan.isDefault && (
              <Badge className="bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30 text-xs">
                DEFAULT
              </Badge>
            )}
            {plan.highlighted && (
              <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30 text-xs">
                FEATURED
              </Badge>
            )}
          </div>
          <span className="text-sm font-mono text-[#9CA3AF]">{plan.slug}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div title={plan.isDefault ? "Cannot disable the default plan" : undefined}>
            <Switch
              checked={plan.active}
              onCheckedChange={(v) => onToggleActive(plan, v)}
              disabled={togglingId === plan.id || plan.isDefault}
              className="data-[state=checked]:bg-[#10B981]"
            />
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onEdit(plan)}
            className="text-[#9CA3AF] hover:text-[#3B82F6]"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(plan)}
            disabled={plan.isDefault || plan.userCount > 0}
            title={
              plan.isDefault
                ? "Cannot delete the default plan"
                : plan.userCount > 0
                  ? `Cannot delete — ${plan.userCount} active user${plan.userCount !== 1 ? "s" : ""}`
                  : undefined
            }
            className="text-[#9CA3AF] hover:text-[#EF4444] disabled:opacity-30 disabled:hover:text-[#9CA3AF]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-lg font-mono tabular-nums text-[#F9FAFB]">
          {formatDollars(plan.priceCentsMonthly)}
          <span className="text-sm text-[#9CA3AF]">/mo</span>
        </span>
        {plan.priceCentsAnnual != null && (
          <span className="text-sm font-mono tabular-nums text-[#9CA3AF]">
            {formatDollars(plan.priceCentsAnnual)}/yr
          </span>
        )}
        <Badge className="bg-white/5 text-[#9CA3AF] border-white/10 text-sm ml-auto">
          {plan.userCount} user{plan.userCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Numeric Limits */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-6 gap-y-3 mb-4">
        {([
          ["Briefings/wk", plan.briefingsPerWeek],
          ["Max duration", plan.maxDurationMinutes != null ? `${plan.maxDurationMinutes}m` : null],
          ["Subscriptions", plan.maxPodcastSubscriptions],
          ["Past episodes", plan.pastEpisodesLimit],
          ["Concurrent jobs", plan.concurrentPipelineJobs],

        ] as [string, unknown][]).map(([label, value]) => (
          <div key={label}>
            <span className="text-sm text-[#6B7280]">{label}</span>
            <div className="text-base text-[#F9FAFB] font-mono font-semibold">
              {value != null ? String(value) : <Infinity className="h-4 w-4 inline" />}
            </div>
          </div>
        ))}
      </div>

      {/* All boolean features */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {([
          ["Ad-Free", plan.adFree],
          ["Priority", plan.priorityProcessing],
          ["Early Access", plan.earlyAccess],
          ["Transcripts", plan.transcriptAccess],
          ["Daily Digest", plan.dailyDigest],
          ["Offline", plan.offlineAccess],
          ["Sharing", plan.publicSharing],
        ] as [string, boolean][]).map(([label, enabled]) => (
          <Badge
            key={label}
            className={cn(
              "text-sm py-1 px-2.5",
              enabled
                ? "bg-[#10B981]/10 text-[#10B981] font-medium"
                : "bg-white/[0.03] text-[#4B5563] font-normal"
            )}
          >
            {enabled
              ? <Check className="h-4 w-4 mr-1" />
              : <X className="h-4 w-4 mr-1" />
            }
            {label}
          </Badge>
        ))}
      </div>

      {/* Voice presets */}
      {(plan.allowedVoicePresetIds?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {plan.allowedVoicePresetIds.map((vpId) => {
            const vp = voicePresets.find((v) => v.id === vpId);
            return (
              <Badge key={vpId} className="bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-normal">
                {vp?.name ?? vpId.slice(0, 6)}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
