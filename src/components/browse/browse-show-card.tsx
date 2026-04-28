import { Link } from "react-router-dom";
import { SignupChip } from "./signup-chip";

export interface BrowseShowCardProps {
  slug: string;
  title: string;
  author: string | null;
  description?: string | null;
  imageUrl: string | null;
  publicEpisodeCount?: number;
  /** Show "Sign up to subscribe" pivot in the card footer. */
  showSignupPivot?: boolean;
}

/**
 * Public-mode show card used on /browse/* pages.
 *
 * Deliberately a separate component from `<PodcastCard>` (auth-only). It
 * doesn't read user state, doesn't render thumb/heart buttons. Where the
 * authenticated card has actions, this one renders a `SignupChip` instead
 * so visitors see what they unlock by signing up.
 */
export function BrowseShowCard({
  slug,
  title,
  author,
  description,
  imageUrl,
  publicEpisodeCount,
  showSignupPivot = true,
}: BrowseShowCardProps) {
  return (
    <div className="flex gap-3 bg-white/5 hover:bg-white/[0.07] border border-white/10 rounded-lg p-3 transition-colors">
      <Link to={`/browse/show/${slug}`} className="flex gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-14 h-14 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-14 h-14 rounded bg-white/10 flex items-center justify-center">
              <span className="text-xl font-bold text-white/60">
                {title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          {author && <p className="text-xs text-white/60 truncate">{author}</p>}
          {description && (
            <p className="text-xs text-white/50 mt-1 line-clamp-2">
              {description.replace(/<[^>]*>/g, "")}
            </p>
          )}
          {publicEpisodeCount !== undefined && publicEpisodeCount > 0 && (
            <p className="text-[10px] text-white/40 mt-0.5">
              {publicEpisodeCount} Blipp{publicEpisodeCount === 1 ? "" : "s"} available
            </p>
          )}
        </div>
      </Link>
      {showSignupPivot && (
        <div className="flex items-center flex-shrink-0">
          <SignupChip
            label="Subscribe"
            size="xs"
            redirectTo={`/discover?show=${encodeURIComponent(slug)}`}
          />
        </div>
      )}
    </div>
  );
}
