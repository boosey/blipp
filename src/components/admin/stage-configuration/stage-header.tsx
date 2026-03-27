import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export interface StageHeaderProps {
  label: string;
  icon: React.ElementType;
  color: string;
  enabled: boolean;
  expanded: boolean;
  warning: string | null;
  primaryLabel: string;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
  onExpand: () => void;
}

export function StageHeader({
  label,
  icon: Icon,
  color,
  enabled,
  expanded,
  warning,
  primaryLabel,
  saving,
  onToggle,
  onExpand,
}: StageHeaderProps) {
  return (
    <button
      onClick={onExpand}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors rounded-lg"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#F9FAFB]">{label}</span>
            {!enabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                disabled
              </span>
            )}
            {warning && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            )}
          </div>
          <span className="text-xs text-[#9CA3AF]">{primaryLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === " ") e.stopPropagation(); }}
        >
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={saving}
            className="data-[state=checked]:bg-[#10B981]"
          />
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
        )}
      </div>
    </button>
  );
}
