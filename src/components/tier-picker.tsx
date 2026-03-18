import { Lock } from "lucide-react";
import { DURATION_TIERS } from "../lib/duration-tiers";
import type { DurationTier } from "../lib/duration-tiers";

export function TierPicker({
  selected,
  onSelect,
  maxDurationMinutes,
  onUpgrade,
}: {
  selected: DurationTier | null;
  onSelect: (tier: DurationTier) => void;
  maxDurationMinutes: number;
  onUpgrade?: (msg: string) => void;
}) {
  return (
    <div className="flex gap-1.5 whitespace-nowrap">
      {DURATION_TIERS.map((tier) => {
        const locked = tier > maxDurationMinutes;
        return (
          <button
            key={tier}
            onClick={() => {
              if (locked) {
                onUpgrade?.(`Your plan supports briefings up to ${maxDurationMinutes} minutes. Upgrade for longer briefings.`);
                return;
              }
              onSelect(tier);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              locked
                ? "bg-card text-muted-foreground/40 cursor-not-allowed"
                : selected === tier
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tier}m
            {locked && <Lock className="w-2.5 h-2.5" />}
          </button>
        );
      })}
    </div>
  );
}
