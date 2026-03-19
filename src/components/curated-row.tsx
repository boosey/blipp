import { ScrollableRow } from "./scrollable-row";
import { EpisodeCard } from "./episode-card";
import type { CuratedRow as CuratedRowType } from "../types/recommendations";

interface CuratedRowProps {
  row: CuratedRowType;
}

export function CuratedRow({ row }: CuratedRowProps) {
  if (row.items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{row.title}</h2>
      <ScrollableRow className="gap-3 pb-2">
        {row.items.map((item, i) => (
          <EpisodeCard
            key={item.episode?.id ?? i}
            episode={item.episode}
            podcast={item.podcast}
            reason={item.reasons?.[0]}
            variant="compact"
          />
        ))}
      </ScrollableRow>
    </section>
  );
}
