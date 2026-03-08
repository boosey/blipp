type StatusLabel = "Creating" | "Complete" | "Error";

const badgeStyles: Record<StatusLabel, string> = {
  Creating: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Complete: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Error: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function StatusBadge({ label }: { label: StatusLabel }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeStyles[label]}`}
    >
      {label}
    </span>
  );
}
