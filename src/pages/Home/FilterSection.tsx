import { ScrollableRow } from "../../components/scrollable-row";
import type { FeedFilter, FeedCounts } from "../../types/feed";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "subscription", label: "Subscriptions" },
  { key: "on_demand", label: "On Demand" },
  { key: "creating", label: "Creating" },
];

interface FilterSectionProps {
  filter: FeedFilter;
  setFilter: (filter: FeedFilter) => void;
  counts?: FeedCounts;
  disabled?: boolean;
}

export function FilterSection({ filter, setFilter, counts, disabled }: FilterSectionProps) {
  return (
    <div className={`mb-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <ScrollableRow className="gap-2 pb-2">
        {FILTERS.map(({ key, label }) => {
          const count = key === "new" ? counts?.unlistened
            : key === "creating" ? counts?.pending
            : key === "all" ? counts?.total
            : undefined;
          
          return (
            <button
              key={key}
              onClick={() => !disabled && setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {count ? `${label} (${count})` : label}
            </button>
          );
        })}
      </ScrollableRow>
    </div>
  );
}
