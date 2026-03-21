import { useState } from "react";
import { ScrollableRow } from "./scrollable-row";
import { EpisodeCard } from "./episode-card";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import type { CuratedRow as CuratedRowType } from "../types/recommendations";

interface CuratedRowProps {
  row: CuratedRowType;
}

function storageKey(title: string) {
  return `blipp-curated-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

export function CuratedRow({ row }: CuratedRowProps) {
  const { open } = usePodcastSheet();
  const [value, setValue] = useState<string[]>(() => {
    try {
      return localStorage.getItem(storageKey(row.title)) === "collapsed" ? [] : ["content"];
    } catch {
      return ["content"];
    }
  });

  if (row.items.length === 0) return null;

  function handleChange(val: string[]) {
    setValue(val);
    try {
      localStorage.setItem(storageKey(row.title), val.length > 0 ? "expanded" : "collapsed");
    } catch { /* quota exceeded */ }
  }

  return (
    <Accordion type="multiple" value={value} onValueChange={handleChange}>
      <AccordionItem value="content" className="border-b-0">
        <AccordionTrigger className="py-1 hover:no-underline">
          <h2 className="text-sm font-semibold">{row.title}</h2>
        </AccordionTrigger>
        <AccordionContent className="pb-0">
          <ScrollableRow className="gap-3 pb-2">
            {row.items.map((item, i) => {
              if (row.type === "podcasts" || !item.episode) {
                const p = item.podcast;
                return (
                  <button
                    key={p?.id ?? i}
                    onClick={() => p?.id && open(p.id)}
                    className="w-[180px] flex-shrink-0 snap-start bg-card border border-border rounded-lg overflow-hidden text-left active:scale-[0.98] transition-transform duration-75"
                  >
                    {p?.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-muted flex items-center justify-center">
                        <span className="text-2xl font-bold text-muted-foreground">
                          {p?.title?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                    <div className="p-2.5 space-y-1">
                      <p className="font-medium text-sm line-clamp-2 leading-tight">{p?.title}</p>
                      {p?.author && <p className="text-xs text-muted-foreground truncate">{p.author}</p>}
                      {item.reasons?.[0] && (
                        <span className="inline-block text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full truncate max-w-full">
                          {item.reasons[0]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              }
              return (
                <EpisodeCard
                  key={item.episode.id}
                  episode={item.episode}
                  podcast={item.podcast}
                  reason={item.reasons?.[0]}
                  variant="compact"
                />
              );
            })}
          </ScrollableRow>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
