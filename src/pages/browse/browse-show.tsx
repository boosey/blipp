import { useParams, useSearchParams } from "react-router-dom";
import { BrowseShell } from "../../components/browse/browse-shell";
import { BrowseEpisodeRow } from "../../components/browse/browse-episode-row";
import { SignupChip } from "../../components/browse/signup-chip";
import { usePublicFetch } from "../../lib/use-public-fetch";
import { useDocumentMeta } from "../../lib/use-document-meta";

interface ShowDetailResponse {
  show: {
    slug: string;
    title: string;
    author: string | null;
    description: string | null;
    imageUrl: string | null;
    categories: string[];
    publicEpisodeCount: number;
  };
  episodes: {
    slug: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  }[];
}

interface EpisodesPageResponse {
  episodes: {
    slug: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    durationSeconds: number | null;
    topicTags: string[];
  }[];
  total: number;
  page: number;
  pageSize: number;
}

export function BrowseShow() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 24;

  const detail = usePublicFetch<ShowDetailResponse>(
    `/public/shows/${encodeURIComponent(slug)}`
  );
  const episodesPage = usePublicFetch<EpisodesPageResponse>(
    `/public/shows/${encodeURIComponent(slug)}/episodes?page=${page}&pageSize=${pageSize}`,
    { enabled: page > 1 }
  );

  useDocumentMeta({
    title: detail.data ? `${detail.data.show.title} — Blipp` : "Show — Blipp",
    description: detail.data?.show.description ?? undefined,
    noindex: true,
    canonical: `https://podblipp.com/browse/show/${slug}`,
    ogImage: detail.data?.show.imageUrl ?? undefined,
  });

  const show = detail.data?.show;
  const totalEpisodes = page === 1 ? show?.publicEpisodeCount ?? 0 : episodesPage.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEpisodes / pageSize));
  const episodesToShow =
    page === 1 ? detail.data?.episodes ?? [] : episodesPage.data?.episodes ?? [];

  return (
    <BrowseShell
      breadcrumbs={[
        { label: "Browse", to: "/browse" },
        { label: show?.title ?? slug },
      ]}
    >
      {detail.loading && <p className="text-sm text-white/50">Loading…</p>}
      {detail.error && <p className="text-sm text-rose-300">{detail.error}</p>}
      {show && (
        <>
          <header className="flex flex-col sm:flex-row gap-5 mb-8">
            {show.imageUrl && (
              <img
                src={show.imageUrl}
                alt={show.title}
                className="w-32 h-32 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {show.title}
              </h1>
              {show.author && (
                <p className="text-sm text-white/60 mt-1">{show.author}</p>
              )}
              {show.categories?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {show.categories.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10 text-white/70"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {show.description && (
                <p className="text-sm text-white/70 mt-3 max-w-2xl">
                  {show.description.replace(/<[^>]*>/g, "")}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <SignupChip
                  label="Subscribe to get new Blipps"
                  size="md"
                  redirectTo={`/discover?show=${encodeURIComponent(show.slug)}`}
                />
                <SignupChip label="Save show" size="md" redirectTo={`/browse/show/${show.slug}`} />
              </div>
            </div>
          </header>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold">
                Blipps available
              </h2>
              <p className="text-xs text-white/50">
                {show.publicEpisodeCount} of this show's episodes have a public Blipp
              </p>
            </div>

            {episodesToShow.length === 0 && (
              <p className="text-sm text-white/50">No public Blipps yet.</p>
            )}

            <div className="space-y-3">
              {episodesToShow.map((ep) => (
                <BrowseEpisodeRow
                  key={ep.slug}
                  showSlug={show.slug}
                  episodeSlug={ep.slug}
                  title={ep.title}
                  description={ep.description}
                  publishedAt={ep.publishedAt}
                  durationSeconds={ep.durationSeconds}
                  topicTags={ep.topicTags}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
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
          </section>
        </>
      )}
    </BrowseShell>
  );
}
