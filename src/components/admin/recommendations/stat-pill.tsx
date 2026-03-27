export interface StatPillProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

export function StatPill({ icon: Icon, label, value, color }: StatPillProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#1A2942] px-3 py-2 flex-1"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] text-[#9CA3AF] leading-none mb-0.5">{label}</div>
        <div className="text-xs font-mono tabular-nums font-semibold text-[#F9FAFB] truncate">
          {value}
        </div>
      </div>
    </div>
  );
}
