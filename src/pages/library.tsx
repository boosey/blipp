import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Library } from "lucide-react";
import { useFetch } from "../lib/use-fetch";
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

function SubscriptionsGrid() {
  const { data, loading } = useFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
  const subscriptions = data?.subscriptions ?? [];

  if (loading) {
    return <LibrarySkeleton />;
  }

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="Your library is empty"
        description="Find podcasts you love and subscribe for automatic briefings."
        action={{ label: "Browse Podcasts", to: "/discover" }}
      />
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
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
              <div className="w-full aspect-square rounded-lg bg-zinc-800" />
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

export function LibraryPage() {
  const [tab, setTab] = useState<"subscriptions" | "history">("subscriptions");

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
          onClick={() => setTab("history")}
          className={`pb-2 text-sm font-medium ${tab === "history" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
        >
          History
        </button>
      </div>

      {tab === "subscriptions" ? (
        <SubscriptionsGrid />
      ) : (
        <Suspense fallback={<LibrarySkeleton />}>
          <History />
        </Suspense>
      )}
    </div>
  );
}
