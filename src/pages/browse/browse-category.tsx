import { useParams, Link, useSearchParams } from "react-router-dom";
import { BrowseShell } from "../../components/browse/browse-shell";
import { BrowseShowCard } from "../../components/browse/browse-show-card";
import { usePublicFetch } from "../../lib/use-public-fetch";
import { useDocumentMeta } from "../../lib/use-document-meta";

interface CategoryShowsResponse {
  category: { slug: string; name: string };
  shows: {
    slug: string;
    title: string;
    author: string | null;
    description: string | null;
    imageUrl: string | null;
    categories: string[];
    publicEpisodeCount: number;
  }[];
  total: number;
  page: number;
  pageSize: number;
}

export function BrowseCategory() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 24;

  const { data, loading, error } = usePublicFetch<CategoryShowsResponse>(
    `/public/categories/${encodeURIComponent(slug)}/shows?page=${page}&pageSize=${pageSize}`
  );

  useDocumentMeta({
    title: data ? `${data.category.name} podcasts on Blipp` : "Category — Blipp",
    description: data
      ? `Browse ${data.total} ${data.category.name.toLowerCase()} podcasts with short-form Blipp summaries.`
      : undefined,
    noindex: true,
    canonical: `https://podblipp.com/browse/category/${slug}`,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <BrowseShell
      breadcrumbs={[
        { label: "Browse", to: "/browse" },
        { label: data?.category.name ?? slug },
      ]}
    >
      {loading && <p className="text-sm text-white/50">Loading…</p>}
      {error && (
        <p className="text-sm text-rose-300">{error}</p>
      )}
      {data && (
        <>
          <header className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {data.category.name}
            </h1>
            <p className="text-sm text-white/50 mt-1">
              {data.total} show{data.total === 1 ? "" : "s"} with public Blipps
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {data.shows.map((show) => (
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

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-sm">
              <button
                disabled={page === 1}
                onClick={() => setSearchParams({ page: String(page - 1) })}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-white/60">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setSearchParams({ page: String(page + 1) })}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </nav>
          )}

          <div className="mt-12 border-t border-white/10 pt-6 text-sm text-white/60">
            <Link to="/browse" className="hover:text-white">
              ← All categories
            </Link>
          </div>
        </>
      )}
    </BrowseShell>
  );
}
