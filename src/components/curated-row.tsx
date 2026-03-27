import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { ScrollableRow } from "./scrollable-row";
import { EpisodeCard } from "./episode-card";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { useAppConfig } from "../lib/app-config";
import { Accordion, AccordionItem, AccordionContent } from "./ui/accordion";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type { CuratedRow as CuratedRowType } from "../types/recommendations";

interface CuratedRowProps {
  row: CuratedRowType;
}

function storageKey(title: string) {
  return `blipp-curated-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

export function CuratedRow({ row }: CuratedRowProps) {
  const { open } = usePodcastSheet();
  const [{ artworkSize }] = useAppConfig();
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
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger className="flex items-center gap-1 py-1 text-left outline-none [&[data-state=open]>svg]:rotate-90">
            <h2 className="text-sm font-semibold">{row.title}</h2>
            <ChevronRightIcon className="size-3.5 text-muted-foreground shrink-0 transition-transform duration-200" />
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionContent className="pb-0">
          <ScrollableRow className="gap-3 pb-2">
            {row.items.map((item, i) => {
              if (row.type === "podcasts" || !item.episode) {
                const p = item.podcast;
                return (
                  <button
                    key={p?.id ?? i}
                    onClick={() => p?.id && open(p.id)}
                    style={{ width: artworkSize }}
                    className="flex-shrink-0 snap-start bg-card border border-border rounded-lg overflow-hidden text-left active:scale-[0.98] transition-transform duration-75"
                  >
                    {p?.imageUrl ? (
                      <div className="w-full bg-muted" style={{ height: artworkSize }}>
                        <img src={p.imageUrl} alt="" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-full bg-muted flex items-center justify-center" style={{ height: artworkSize }}>
                        <span className="text-2xl font-bold text-muted-foreground">
                          {p?.title?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                    <div className="p-2 space-y-0.5">
                      <p className="font-medium text-xs line-clamp-2 leading-tight">{p?.title}</p>
                      {p?.author && <p className="text-[11px] text-muted-foreground truncate">{p.author}</p>}
                    </div>
                  </button>
                );
              }
              return (
                <EpisodeCard
                  key={item.episode.id}
                  episode={item.episode}
                  podcast={item.podcast}
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
