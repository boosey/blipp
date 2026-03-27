import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max,
  className,
  color,
}: {
  value: number;
  max: number;
  className?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-white/10 overflow-hidden",
        className
      )}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color || "#3B82F6" }}
      />
    </div>
  );
}
