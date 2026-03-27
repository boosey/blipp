import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_META, STATUS_CONFIG } from "./pipeline-constants";
import type { PipelineJobStatus, PipelineStage } from "@/types/admin";

export function StatusBadge({ status }: { status: PipelineJobStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
    >
      <Icon className={cn("h-3 w-3", status === "IN_PROGRESS" && "animate-spin")} />
      {cfg.label}
    </span>
  );
}

export function DurationTierBadge({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-[#3B82F6]/10 text-[#3B82F6]">
      <Timer className="h-3 w-3" />
      {minutes} min
    </span>
  );
}

export function StageBadge({ stage }: { stage: PipelineStage }) {
  const meta = STAGE_META.find((m) => m.stage === stage);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
    >
      <Icon className="h-3 w-3" />
      {meta.name}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white/[0.03] p-2">
      <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[11px]">{children}</div>
    </div>
  );
}
