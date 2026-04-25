import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useApiFetch } from "../lib/api-client";
import { useFetch } from "../lib/use-fetch";
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
import { FeedSkeleton } from "../components/skeletons/feed-skeleton";
import { CuratedRow } from "../components/curated-row";
import { useOnboarding } from "../contexts/onboarding-context";
import { useAudio } from "../contexts/audio-context";
import { useStorage } from "../contexts/storage-context";
import { InstallPrompt } from "../components/install-prompt";
import { CancelBlippDialog } from "../components/cancel-blipp-dialog";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { useFeed } from "../hooks/use-feed";
import type { CuratedResponse } from "../types/recommendations";

// Local Sub-components
import { FilterSection } from "./Home/FilterSection";
import { OnboardingSection } from "./Home/OnboardingSection";
import { GeneratingSection } from "./Home/GeneratingSection";
import { EmptyStateSection } from "./Home/EmptyStateSection";

export function Home() {
  const apiFetch = useApiFetch();
  const audio = useAudio();
  const { prefetcher, manager } = useStorage();
  const { needsOnboarding } = useOnboarding();
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => !!localStorage.getItem("swipe-hint-seen"));
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const {
    items,
    setItems,
    loading,
    filter,
    setFilter,
    counts,
    fetchFeed,
    isGenerating,
    justOnboarded,
    generatingTimedOut,
    isZeroSubscriptionUser,
    groups,
    unlistenedReady,
    pendingItems,
    readyItems,
    failedItems,
    markListened,
    voteEpisode,
    removeItem,
    cancelBriefing,
  } = useFeed();

  const { data: curatedData } = useFetch<CuratedResponse>("/recommendations/curated");

  useEffect(() => {
    if (!items || items.length === 0) return;
    void prefetcher.scheduleFromFeed(items);
    void manager
      .pruneNotInFeed(
        items.map((i) => i.briefing?.id).filter(Boolean) as string[],
      )
      .catch(() => {});
  }, [items, prefetcher, manager]);

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: fetchFeed,
  });

  function handlePlay(feedItemId: string) {
    markListened(feedItemId);
  }

  function handlePlayAll() {
    if (unlistenedReady.length === 0) return;
    audio.playAll(unlistenedReady);
    // Mark all as listened optimistically
    const ids = new Set(unlistenedReady.map((i) => i.id));
    setItems((prev) =>
      prev.map((i) => (ids.has(i.id) ? { ...i, listened: true } : i))
    );
    for (const item of unlistenedReady) {
      handlePlay(item.id);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    await cancelBriefing(cancelTarget);
    setCancelTarget(null);
  }

  if (loading) {
    return <FeedSkeleton />;
  }

  return (
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-3">Your Feed</h1>

      {needsOnboarding ? (
        <>
          <FilterSection filter="all" setFilter={() => {}} disabled />
          <OnboardingSection onRefresh={fetchFeed} />
        </>
      ) : isGenerating || (justOnboarded && generatingTimedOut && pendingItems.length > 0) ? (
        <>
          <FilterSection filter="all" setFilter={() => {}} disabled />
          <GeneratingSection
            readyItems={readyItems}
            skeletonCount={items.length > 0 ? items.length - failedItems.length - readyItems.length : (counts?.pending ?? 3)}
            generatingTimedOut={generatingTimedOut}
            onRefresh={fetchFeed}
            onPlay={handlePlay}
            onRemove={removeItem}
            onEpisodeVote={voteEpisode}
            onCancel={setCancelTarget}
          />
        </>
      ) : isZeroSubscriptionUser ? (
        <EmptyStateSection curatedData={curatedData || undefined} />
      ) : (
        <>
          <FilterSection filter={filter} setFilter={setFilter} counts={counts || undefined} />
          
          <InstallPrompt />

          {/* Swipe hint — first session only */}
          {!swipeHintDismissed && items.length > 0 && (
            <div
              className="flex sm:hidden items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground animate-fade-in"
              role="status"
            >
              <span className="inline-block animate-bounce-x">👈</span>
              Swipe left to remove, right to add to queue
              <button
                onClick={() => { localStorage.setItem("swipe-hint-seen", "1"); setSwipeHintDismissed(true); }}
                className="ml-auto text-xs text-muted-foreground/60 hover:text-foreground"
                aria-label="Dismiss swipe hint"
              >
                Got it
              </button>
            </div>
          )}

          {/* Suggested Next Blipps */}
          {curatedData?.rows?.[0]?.items && curatedData.rows[0].items.length > 0 && (
            <div className="mb-3">
              <CuratedRow row={{ title: "Suggested Next Blipp", type: curatedData.rows[0].type, items: curatedData.rows[0].items.slice(0, 6) }} />
            </div>
          )}

          {/* Play All button */}
          {unlistenedReady.length > 0 && (
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 mb-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform duration-75"
            >
              <Play className="w-4 h-4" />
              Play All ({unlistenedReady.length})
            </button>
          )}

          {/* Date-grouped feed */}
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {filter === "creating" ? "No briefings are being created right now." : "Nothing here yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.label}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.items.map((item, index) => (
                      <div
                        key={item.id}
                        className="feed-item-enter"
                        style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                      >
                        <SwipeableFeedItem
                          item={item}
                          onPlay={handlePlay}
                          onRemove={removeItem}
                          onEpisodeVote={voteEpisode}
                          onCancel={setCancelTarget}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <CancelBlippDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
