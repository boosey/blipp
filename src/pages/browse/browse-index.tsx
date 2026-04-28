import { Link } from "react-router-dom";
import { BrowseShell } from "../../components/browse/browse-shell";
import { BrowseShowCard } from "../../components/browse/browse-show-card";
import { SignupChip } from "../../components/browse/signup-chip";
import { usePublicFetch } from "../../lib/use-public-fetch";
import { useDocumentMeta } from "../../lib/use-document-meta";

interface CategoryListResponse {
  categories: { slug: string; name: string; showCount: number }[];
}

interface FeaturedRow {
  id: string;
  title: string;
  shows: {
    slug: string;
    title: string;
    author: string | null;
    description: string | null;
    imageUrl: string | null;
    categories: string[];
    publicEpisodeCount: number;
  }[];
}

interface FeaturedResponse {
  rows: FeaturedRow[];
}

interface RecentBlippItem {
  episode: {
    slug: string;
    title: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  };
  show: { slug: string; title: string; imageUrl: string | null };
}

export function BrowseIndex() {
  useDocumentMeta({
    title: "Browse the Blipp catalog",
    description: "Explore podcasts and short-form Blipp summaries by category, trending, or what was just Blipped.",
    noindex: true,
    canonical: "https://podblipp.com/browse",
  });

  const cats = usePublicFetch<CategoryListResponse>("/public/categories");
  const featured = usePublicFetch<FeaturedResponse>("/public/recommendations/featured");
  const recent = usePublicFetch<{ items: RecentBlippItem[] }>("/public/recently-blipped?limit=8");

  return (
    <BrowseShell>
      <section className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Browse the Blipp catalog
        </h1>
        <p className="text-white/60 mt-2 max-w-xl">
          Find podcasts you care about. Read the short-form Blipp summary first; sign up to listen to the full Blipp.
        </p>
      </section>

      {recent.data && recent.data.items.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Recently Blipped</h2>
            <SignupChip label="Get new Blipps daily" size="xs" redirectTo="/browse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recent.data.items.map((item) => (
              <Link
                key={`${item.show.slug}-${item.episode.slug}`}
                to={`/p/${item.show.slug}/${item.episode.slug}`}
                className="border border-white/10 rounded-lg p-3 bg-white/5 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex gap-3 items-start">
                  {item.show.imageUrl && (
                    <img
                      src={item.show.imageUrl}
                      alt={item.show.title}
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] text-white/50 truncate">{item.show.title}</p>
                    <p className="text-sm font-medium leading-snug line-clamp-2 mt-0.5">
                      {item.episode.title}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.data?.rows.map((row) => (
        <section key={row.id} className="mb-12">
          <h2 className="text-lg font-semibold mb-3">{row.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {row.shows.map((show) => (
              <BrowseShowCard
                key={show.slug}
                slug={show.slug}
                title={show.title}
                author={show.author}
                description={show.description}
                imageUrl={show.imageUrl}
                publicEpisodeCount={show.publicEpisodeCount}
              />
            ))}
          </div>
        </section>
      ))}

      {cats.data && cats.data.categories.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-3">Browse by category</h2>
          <div className="flex flex-wrap gap-2">
            {cats.data.categories.map((cat) => (
              <Link
                key={cat.slug}
                to={`/browse/category/${cat.slug}`}
                className="text-sm px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 transition-colors"
              >
                {cat.name}
                <span className="ml-1.5 text-white/50">{cat.showCount}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {cats.loading && featured.loading && (
        <p className="text-sm text-white/50">Loading the catalog…</p>
      )}
      {cats.error && (
        <p className="text-sm text-rose-300">Catalog unavailable. Try again in a moment.</p>
      )}
    </BrowseShell>
  );
}
