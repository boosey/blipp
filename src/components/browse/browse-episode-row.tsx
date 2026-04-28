import { Link } from "react-router-dom";
import { SignupChip } from "./signup-chip";

export interface BrowseEpisodeRowProps {
  showSlug: string;
  episodeSlug: string;
  title: string;
  description?: string | null;
  publishedAt?: string | Date | null;
  durationSeconds?: number | null;
  topicTags?: string[];
}

function formatDuration(s: number | null | undefined) {
  if (!s) return null;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Episode row used on /browse/show/:slug.
 *
 * Primary link points to the SSR-rendered Blipp page (`/p/:show/:episode`),
 * which is where the actual conversion happens (truncated narrative + Top
 * Takeaways + signup CTA). The "Listen full" pivot becomes a SignupChip
 * because the full Blipp audio requires an account.
 */
export function BrowseEpisodeRow({
  showSlug,
  episodeSlug,
  title,
  description,
  publishedAt,
  durationSeconds,
  topicTags,
}: BrowseEpisodeRowProps) {
  const blippHref = `/p/${showSlug}/${episodeSlug}`;
  const dateLabel = formatDate(publishedAt);
  const duration = formatDuration(durationSeconds);

  return (
    <article className="border border-white/10 rounded-lg p-3 bg-white/5 hover:bg-white/[0.07] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link to={blippHref} className="block">
            <h3 className="font-medium text-sm leading-snug hover:underline">
              {title}
            </h3>
          </Link>
          <div className="text-[11px] text-white/50 mt-1 flex flex-wrap gap-x-2">
            {dateLabel && <span>{dateLabel}</span>}
            {duration && <span>· {duration} original</span>}
          </div>
          {description && (
            <p className="text-xs text-white/60 mt-2 line-clamp-2">
              {description.replace(/<[^>]*>/g, "")}
            </p>
          )}
          {topicTags && topicTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {topicTags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-white/70"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            to={blippHref}
            className="text-xs whitespace-nowrap rounded-full bg-white text-black px-2.5 py-1 hover:bg-white/90 transition-colors"
          >
            Read the Blipp →
          </Link>
          <SignupChip label="Hear full Blipp" size="xs" redirectTo={blippHref} />
        </div>
      </div>
    </article>
  );
}
