import {
  Mic,
  Sparkles,
  FileText,
  Volume2,
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { formatDurationMs, formatCost, relativeTime } from "@/lib/admin-formatters";
import type { PipelineStage } from "@/types/admin";

export const STAGE_META: { stage: PipelineStage; name: string; icon: React.ElementType; color: string }[] = [
  { stage: "TRANSCRIPTION", name: "Transcription", icon: Mic, color: "#8B5CF6" },
  { stage: "DISTILLATION", name: "Distillation", icon: Sparkles, color: "#F59E0B" },
  { stage: "NARRATIVE_GENERATION", name: "Narrative Gen", icon: FileText, color: "#10B981" },
  { stage: "AUDIO_GENERATION", name: "Audio Gen", icon: Volume2, color: "#06B6D4" },
  { stage: "BRIEFING_ASSEMBLY", name: "Briefing Assembly", icon: Package, color: "#3B82F6" },
];

export const STAGE_ORDER: PipelineStage[] = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"];

export const STATUS_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 0,
  PENDING: 1,
  FAILED: 2,
  COMPLETED: 3,
};

export const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  COMPLETED: { color: "#10B981", icon: CheckCircle2, label: "Done" },
  FAILED: { color: "#EF4444", icon: XCircle, label: "Failed" },
  IN_PROGRESS: { color: "#F59E0B", icon: Loader2, label: "Running" },
  PENDING: { color: "#9CA3AF", icon: Clock, label: "Queued" },
};

export const formatDuration = formatDurationMs;

export function stageName(stage: PipelineStage): string {
  return STAGE_META.find((m) => m.stage === stage)?.name ?? stage;
}

export { formatCost, relativeTime };
