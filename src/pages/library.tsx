import { useState, lazy, Suspense, useRef, useEffect } from "react";
import { Library, Heart, Trash2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { useFetch } from "../lib/use-fetch";
import { useApiFetch } from "../lib/api";
import { LibrarySkeleton } from "../components/skeletons/library-skeleton";
import { EmptyState } from "../components/empty-state";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { SubscriptionManageSheet } from "../components/subscription-manage-sheet";

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

function SubscriptionsGrid({ onRefetchRef }: { onRefetchRef?: React.MutableRefObject<(() => void) | null> }) {
  const { open: openPodcast } = usePodcastSheet();
  const apiFetch = useApiFetch();
  const { data, loading, refetch } = useFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
  const [managingSub, setManagingSub] = useState<SubscribedPodcast | null>(null);

  useEffect(() => {
    if (onRefetchRef) onRefetchRef.current = refetch;
  }, [onRefetchRef, refetch]);
  const subscriptions = data?.subscriptions ?? [];

  async function handleTierChange(subId: string, tier: number) {
    try {
      await apiFetch(`/podcasts/subscribe/${subId}`, {
        method: "PATCH",
        body: JSON.stringify({ durationTier: tier }),
      });
      toast.success("Briefing length updated");
      refetch();
      setManagingSub(null);
    } catch {
      toast.error("Failed to update briefing length");
    }
  }

  async function handleUnsubscribe(subId: string) {
    try {
      await apiFetch(`/podcasts/subscribe/${subId}`, { method: "DELETE" });
      toast.success("Unsubscribed");
      refetch();
      setManagingSub(null);
    } catch {
      toast.error("Failed to unsubscribe");
    }
  }

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
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {subscriptions.map((sub) => (
          <div key={sub.id} className="relative group">
            <button
              onClick={() => openPodcast(sub.podcast.id)}
              className="flex flex-col items-center gap-2 active:scale-[0.98] transition-transform duration-75 w-full"
            >
              <div className="relative w-full">
                {sub.podcast.imageUrl ? (
                  <img
                    src={sub.podcast.imageUrl}
                    alt={sub.podcast.title}
                    className="w-full aspect-square rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                    <span className="text-xl font-bold text-muted-foreground">
                      {sub.podcast.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {sub.durationTier && (
                  <span className="absolute bottom-1 right-1 text-[10px] font-medium bg-background/80 text-foreground/70 px-1.5 py-0.5 rounded">
                    {sub.durationTier}m
                  </span>
                )}
              </div>
              <p className="text-xs text-center font-medium truncate w-full">
                {sub.podcast.title}
              </p>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setManagingSub(sub); }}
              className="absolute top-1 right-1 p-1.5 rounded-full bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              title="Manage subscription"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <SubscriptionManageSheet
        subscription={managingSub}
        open={!!managingSub}
        onOpenChange={(open) => !open && setManagingSub(null)}
        onTierChange={handleTierChange}
        onUnsubscribe={handleUnsubscribe}
      />
    </>
  );
}

function FavoritesGrid({ onRefetchRef }: { onRefetchRef?: React.MutableRefObject<(() => void) | null> }) {
  const { open: openPodcast } = usePodcastSheet();
  const apiFetch = useApiFetch();
  const { data, loading, refetch } = useFetch<{ data: FavoritePodcast[] }>("/podcasts/favorites");

  useEffect(() => {
    if (onRefetchRef) onRefetchRef.current = refetch;
  }, [onRefetchRef, refetch]);
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
          <button
            onClick={() => openPodcast(podcast.id)}
            className="flex flex-col items-center gap-2 active:scale-[0.98] transition-transform duration-75 w-full"
          >
            {podcast.imageUrl ? (
              <img
                src={podcast.imageUrl}
                alt={podcast.title}
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                <span className="text-xl font-bold text-muted-foreground">
                  {podcast.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <p className="text-xs text-center font-medium truncate w-full">
              {podcast.title}
            </p>
          </button>
          <button
            onClick={() => removeFavorite(podcast.id)}
            className="absolute top-1 right-1 p-1.5 rounded-full bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
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
  const [tab, setTab] = useState<"favorites" | "subscriptions" | "history">("favorites");
  const refetchRef = useRef<(() => void) | null>(null);

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: async () => { refetchRef.current?.(); },
  });

  return (
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-4">Library</h1>

      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          onClick={() => setTab("favorites")}
          className={`pb-2 text-sm font-medium ${tab === "favorites" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"}`}
        >
          Favorites
        </button>
        <button
          onClick={() => setTab("subscriptions")}
          className={`pb-2 text-sm font-medium ${tab === "subscriptions" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"}`}
        >
          Subscriptions
        </button>
        <button
          onClick={() => setTab("history")}
          className={`pb-2 text-sm font-medium ${tab === "history" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground"}`}
        >
          History
        </button>
      </div>

      {tab === "favorites" && <FavoritesGrid onRefetchRef={refetchRef} />}
      {tab === "subscriptions" && <SubscriptionsGrid onRefetchRef={refetchRef} />}
      {tab === "history" && (
        <Suspense fallback={<LibrarySkeleton />}>
          <History />
        </Suspense>
      )}
    </div>
  );
}
