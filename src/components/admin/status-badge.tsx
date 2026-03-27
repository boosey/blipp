import { cn } from "@/lib/utils";

export interface StatusStyles {
  bg: string;
  text: string;
  pulse?: boolean;
}

export function StatusBadge({
  status,
  styles,
}: {
  status: string;
  styles: Record<string, StatusStyles>;
}) {
  const s = styles[status] || { bg: "#9CA3AF20", text: "#9CA3AF" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        s.pulse && "animate-pulse"
      )}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}
