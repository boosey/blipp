import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Library, Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFetch } from "../lib/use-fetch";
import { useApiFetch } from "../lib/api";
import { LibrarySkeleton } from "../components/skeletons/library-skeleton";
import { EmptyState } from "../components/empty-state";

const History = lazy(() => import("./history"));

interface SubscribedPodcast {
  id: string;
  podcastId: string;
  durationTier: number | null;
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
    author: string | null;
  };
}

interface FavoritePodcast {
  id: string;
  title: string;
  imageUrl: string | null;
  author: string | null;
}

function SubscriptionsGrid() {
  const { data, loading } = useFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
  const subscriptions = data?.subscriptions ?? [];

  if (loading) return <LibrarySkeleton />;

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="No subscriptions yet"
        description="Subscribe to podcasts to get automatic briefings delivered to your feed."
        action={{ label: "Browse Podcasts", to: "/discover" }}
      />
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {subscriptions.map((sub) => (
        <Link
          key={sub.id}
          to={`/discover/${sub.podcast.id}`}
          className="flex flex-col items-center gap-2"
        >
          <div className="relative w-full">
            {sub.podcast.imageUrl ? (
              <img
                src={sub.podcast.imageUrl}
                alt={sub.podcast.title}
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-zinc-800 flex items-center justify-center">
                <span className="text-xl font-bold text-zinc-500">
                  {sub.podcast.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {sub.durationTier && (
              <span className="absolute bottom-1 right-1 text-[10px] font-medium bg-zinc-950/80 text-zinc-300 px-1.5 py-0.5 rounded">
                {sub.durationTier}m
              </span>
            )}
          </div>
          <p className="text-xs text-center font-medium truncate w-full">
            {sub.podcast.title}
          </p>
        </Link>
      ))}
    </div>
  );
}

function FavoritesGrid() {
  const apiFetch = useApiFetch();
  const { data, loading, refetch } = useFetch<{ data: FavoritePodcast[] }>("/podcasts/favorites");
  const favorites = data?.data ?? [];

  if (loading) return <LibrarySkeleton />;

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        description="Favorite podcasts you're interested in. We'll use this to personalize your experience."
        action={{ label: "Discover Podcasts", to: "/discover" }}
      />
    );
  }

  async function removeFavorite(podcastId: string) {
    try {
      await apiFetch(`/podcasts/favorites/${podcastId}`, { method: "DELETE" });
      toast.success("Removed from favorites");
      refetch();
    } catch {
      toast.error("Failed to remove favorite");
    }
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {favorites.map((podcast) => (
        <div key={podcast.id} className="relative group">
          <Link
            to={`/discover/${podcast.id}`}
            className="flex flex-col items-center gap-2"
          >
            {podcast.imageUrl ? (
              <img
                src={podcast.imageUrl}
                alt={podcast.title}
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-zinc-800 flex items-center justify-center">
                <span className="text-xl font-bold text-zinc-500">
                  {podcast.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <p className="text-xs text-center font-medium truncate w-full">
              {podcast.title}
            </p>
          </Link>
          <button
            onClick={() => removeFavorite(podcast.id)}
            className="absolute top-1 right-1 p-1.5 rounded-full bg-zinc-950/70 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
            title="Remove from favorites"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function LibraryPage() {
  const [tab, setTab] = useState<"subscriptions" | "favorites" | "history">("subscriptions");

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Library</h1>

      <div className="flex gap-4 mb-4 border-b border-zinc-800">
        <button
          onClick={() => setTab("subscriptions")}
          className={`pb-2 text-sm font-medium ${tab === "subscriptions" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
        >
          Subscriptions
        </button>
        <button
          onClick={() => setTab("favorites")}
          className={`pb-2 text-sm font-medium ${tab === "favorites" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
        >
          Favorites
        </button>
        <button
          onClick={() => setTab("history")}
          className={`pb-2 text-sm font-medium ${tab === "history" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
        >
          History
        </button>
      </div>

      {tab === "subscriptions" && <SubscriptionsGrid />}
      {tab === "favorites" && <FavoritesGrid />}
      {tab === "history" && (
        <Suspense fallback={<LibrarySkeleton />}>
          <History />
        </Suspense>
      )}
    </div>
  );
}
