import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Headphones, Play } from "lucide-react";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
import { FeedSkeleton } from "../components/skeletons/feed-skeleton";
import { EmptyState } from "../components/empty-state";
import { CuratedRow } from "../components/curated-row";
import { WelcomeCard } from "../components/welcome-card";
import { SubscribeNudge } from "../components/subscribe-nudge";
import { TopicsCard, PodcastPickerCard, DiscoverNudge } from "../components/inline-onboarding-cards";
import { useOnboarding } from "../contexts/onboarding-context";
import { usePlan } from "../contexts/plan-context";
import type { FeedItem, FeedFilter, FeedCounts } from "../types/feed";
import type { CuratedResponse } from "../types/recommendations";
import { groupByDate } from "../lib/feed-utils";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
import { useAudio } from "../contexts/audio-context";
import { InstallPrompt } from "../components/install-prompt";
import { CancelBlippDialog } from "../components/cancel-blipp-dialog";
import { ScrollableRow } from "../components/scrollable-row";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "subscription", label: "Subscriptions" },
  { key: "on_demand", label: "On Demand" },
  { key: "creating", label: "Creating" },
];

const GENERATING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function buildFilterParams(filter: FeedFilter): string {
  switch (filter) {
    case "new":
      return "&listened=false";
    case "subscription":
      return "&source=SUBSCRIPTION";
    case "on_demand":
      return "&source=ON_DEMAND";
    case "creating":
      return "&status=PENDING";
    default:
      return "";
  }
}

export function Home() {
  const apiFetch = useApiFetch();
  const audio = useAudio();
  const { needsOnboarding, markComplete } = useOnboarding();
  const { maxDurationMinutes } = usePlan();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => !!localStorage.getItem("swipe-hint-seen"));
  const [generatingTimedOut, setGeneratingTimedOut] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  // Inline onboarding state
  const [showTopicsCard, setShowTopicsCard] = useState(true);
  const [showPodcastCard, setShowPodcastCard] = useState(true);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [subscribing, setSubscribing] = useState(false); // locks UI during subscribe

  const { data: counts } = useFetch<FeedCounts>("/feed/counts");
  const { data: curatedData } = useFetch<CuratedResponse>("/recommendations/curated");

  // Track "just onboarded" state via sessionStorage
  const justOnboarded = sessionStorage.getItem("blipp-just-onboarded") === "1";
  const generatingStartRef = useRef<number | null>(
    justOnboarded ? Date.now() : null
  );

  const fetchFeed = useCallback(async () => {
    try {
      const params = buildFilterParams(filter);
      const data = await apiFetch<{ items: FeedItem[] }>(`/feed?limit=50${params}`);
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filter]);

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: fetchFeed,
  });

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  // Poll every 5s if any items are pending/processing
  useEffect(() => {
    const hasActive = items.some(
      (i) => i.status === "PENDING" || i.status === "PROCESSING"
    );
    // Also poll during generating state even if items array is empty
    if (!hasActive && !justOnboarded) return;

    const interval = setInterval(fetchFeed, 5000);
    return () => clearInterval(interval);
  }, [items, fetchFeed]);

  // Background poll every 60s to pick up new feed items
  useEffect(() => {
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // Generating state timeout — 3 minutes
  useEffect(() => {
    if (!justOnboarded || generatingTimedOut) return;

    const elapsed = Date.now() - (generatingStartRef.current ?? Date.now());
    const remaining = GENERATING_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setGeneratingTimedOut(true);
      return;
    }

    const timer = setTimeout(() => setGeneratingTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [justOnboarded, generatingTimedOut]);

  // Determine generating state:
  // User just onboarded, has items, all are PENDING/PROCESSING (none READY yet)
  const pendingItems = items.filter(
    (i) => i.status === "PENDING" || i.status === "PROCESSING"
  );
  const readyItems = items.filter((i) => i.status === "READY");
  const failedItems = items.filter((i) => i.status === "FAILED");

  const isGenerating =
    justOnboarded &&
    !generatingTimedOut &&
    (items.length === 0 || readyItems.length < items.length - failedItems.length);

  // Clear "just onboarded" flag once all items are ready (or timed out)
  useEffect(() => {
    if (!justOnboarded) return;
    const allDone =
      items.length > 0 &&
      pendingItems.length === 0;
    if (allDone || generatingTimedOut) {
      sessionStorage.removeItem("blipp-just-onboarded");
    }
  }, [items, pendingItems.length, justOnboarded, generatingTimedOut]);

  // Detect zero-subscription users who skipped onboarding
  const isZeroSubscriptionUser =
    !loading && items.length === 0 && filter === "all" && !justOnboarded;

  // Sort by request time, youngest first
  const sortedItems = useMemo(() => {
    const filtered =
      filter === "creating"
        ? items.filter((i) => i.status === "PENDING" || i.status === "PROCESSING")
        : items;

    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [items, filter]);

  const groups = useMemo(() => groupByDate(sortedItems), [sortedItems]);

  const unlistenedReady = useMemo(
    () => sortedItems.filter((i) => !i.listened && i.status === "READY"),
    [sortedItems]
  );

  function handlePlay(feedItemId: string) {
    // Mark listened optimistically — non-critical, no toast
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(
      () => {}
    );
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

  async function handleEpisodeVote(episodeId: string, vote: number) {
    const prevItems = items;
    setItems((prev) =>
      prev.map((i) => (i.episode.id === episodeId ? { ...i, episodeVote: vote } : i))
    );
    try {
      await apiFetch(`/podcasts/episodes/vote/${episodeId}`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
    } catch {
      setItems(prevItems);
    }
  }

  function handleRemove(feedItemId: string) {
    const removedItem = items.find((i) => i.id === feedItemId);
    if (!removedItem) return;

    // Optimistic removal
    setItems((prev) => prev.filter((i) => i.id !== feedItemId));

    const timeoutId = setTimeout(() => {
      apiFetch(`/feed/${feedItemId}`, { method: "DELETE" }).catch(() => {
        // Restore on failure
        setItems((prev) => [...prev, removedItem].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
        toast.error("Failed to remove item");
      });
    }, 5000);

    toast("Item removed", {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          setItems((prev) => [...prev, removedItem].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ));
        },
      },
      duration: 5000,
    });
  }

  function handleCancelRequest(feedItemId: string) {
    setCancelTarget(feedItemId);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    const item = items.find((i) => i.id === cancelTarget);
    if (!item) return;
    const savedStatus = item.status;

    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === cancelTarget ? { ...i, status: "CANCELLED" as const } : i));
    setCancelTarget(null);

    try {
      await apiFetch(`/briefings/cancel-by-feed-item/${item.id}`, { method: "POST" });
      toast.success("Briefing cancelled");
    } catch {
      // Revert on failure
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: savedStatus } : i));
      toast.error("Failed to cancel briefing");
    }
  }

  // ── Inline onboarding handlers ──

  async function handleTopicsDone(categories: string[]) {
    setPreferredCategories(categories);
    setShowTopicsCard(false);
    // Save preferences in background — non-blocking
    try {
      await apiFetch("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferredCategories: categories,
          excludedCategories: [],
          preferredTopics: [],
          excludedTopics: [],
        }),
      });
    } catch {
      // Non-critical
    }
  }

  function handleTopicsSkip() {
    setShowTopicsCard(false);
  }

  async function handlePodcastSubscribe(
    podcasts: { id: string; title: string; feedUrl: string; description: string | null; imageUrl: string | null; author: string | null }[]
  ) {
    setSubscribing(true);
    const durationTier = Math.min(maxDurationMinutes, 5);

    await Promise.allSettled(
      podcasts.map((p) =>
        apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: p.feedUrl,
            title: p.title,
            durationTier,
            description: p.description,
            imageUrl: p.imageUrl,
            author: p.author,
          }),
        })
      )
    );

    // Mark onboarding complete (triggers starter pack delivery on backend)
    try {
      await apiFetch("/me/onboarding-complete", { method: "PATCH" });
    } catch {
      // Non-critical
    }
    markComplete();
    setShowPodcastCard(false);
    setSubscribing(false);

    sessionStorage.setItem("blipp-just-onboarded", "1");
    generatingStartRef.current = Date.now();
    fetchFeed();
  }

  async function handlePodcastSkip() {
    setShowPodcastCard(false);
    // Mark onboarding complete even without subscriptions (triggers starter pack)
    try {
      await apiFetch("/me/onboarding-complete", { method: "PATCH" });
    } catch {
      // Non-critical
    }
    markComplete();
    sessionStorage.setItem("blipp-just-onboarded", "1");
    generatingStartRef.current = Date.now();
    fetchFeed();
  }

  if (loading) {
    return <FeedSkeleton />;
  }

  // ── Inline onboarding: show cards when user needs onboarding ──
  if ((needsOnboarding || subscribing) && (showTopicsCard || showPodcastCard)) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-3">Your Feed</h1>

        {/* Dimmed filter pills during onboarding */}
        <div className="opacity-50 pointer-events-none mb-3">
          <ScrollableRow className="gap-2 pb-2">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
                  key === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </ScrollableRow>
        </div>

        {showTopicsCard && (
          <TopicsCard onDone={handleTopicsDone} onSkip={handleTopicsSkip} />
        )}

        {showPodcastCard && (
          <PodcastPickerCard
            preferredCategories={preferredCategories}
            onSubscribe={handlePodcastSubscribe}
            onSkip={handlePodcastSkip}
          />
        )}

        <DiscoverNudge />
      </div>
    );
  }

  // Post-onboarding generating state
  if (isGenerating || (justOnboarded && generatingTimedOut && pendingItems.length > 0)) {
    const totalGenerating = items.length > 0
      ? items.length - failedItems.length
      : (counts?.pending ?? 3);
    const skeletonCount = Math.max(0, totalGenerating - readyItems.length);

    return (
      <div>
        <h1 className="text-xl font-bold mb-3">Your Feed</h1>

        {/* Filter pills (dimmed during generating) */}
        <div className="opacity-50 pointer-events-none mb-3">
          <ScrollableRow className="gap-2 pb-2">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
                  key === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </ScrollableRow>
        </div>

        <WelcomeCard
          readyCount={readyItems.length}
          totalCount={totalGenerating}
          timedOut={generatingTimedOut}
          onRetry={fetchFeed}
        />

        {/* Ready items with animation */}
        {readyItems.length > 0 && (
          <div className="space-y-2 mb-2">
            {readyItems.map((item, index) => (
              <div
                key={item.id}
                className="feed-item-enter"
                style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
              >
                <SwipeableFeedItem
                  item={item}
                  onPlay={handlePlay}
                  onRemove={handleRemove}
                  onEpisodeVote={handleEpisodeVote}
                  onCancel={handleCancelRequest}
                />
              </div>
            ))}
          </div>
        )}

        {/* Skeleton cards for pending items */}
        {skeletonCount > 0 && (
          <div className="space-y-2">
            {Array.from({ length: Math.min(skeletonCount, 3) }, (_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex gap-3 bg-card border border-border rounded-lg p-3"
              >
                <div className="w-12 h-12 rounded flex-shrink-0 bg-accent animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded-md bg-accent animate-pulse" />
                  <div className="h-4 w-3/4 rounded-md bg-accent animate-pulse" />
                  <div className="h-3 w-1/2 rounded-md bg-accent animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Zero-subscription empty state with nudge
  if (items.length === 0 && filter === "all") {
    return (
      <div>
        <SubscribeNudge />
        <EmptyState
          icon={Headphones}
          title="No briefings yet"
          description="Subscribe to podcasts and we'll create bite-sized briefings. Or tap a podcast below to get started."
          action={{ label: "Browse All Podcasts", to: "/discover" }}
        />
        {curatedData?.rows?.[0] && (
          <CuratedRow row={{ ...curatedData.rows[0], title: "Popular Podcasts" }} />
        )}
      </div>
    );
  }

  if (items.length === 0 && filter !== "all") {
    return (
      <div>
        <h1 className="text-xl font-bold mb-3">Your Feed</h1>
        <div className="mb-3">
          <ScrollableRow className="gap-2 pb-2">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </ScrollableRow>
        </div>
        <p className="text-center text-sm text-muted-foreground py-12">
          {filter === "creating" ? "No briefings are being created right now." : "Nothing here yet."}
        </p>
      </div>
    );
  }

  return (
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-3">Your Feed</h1>

      {/* Filter pills */}
      <div className="mb-3">
        <ScrollableRow className="gap-2 pb-2">
          {FILTERS.map(({ key, label }) => {
            const count = key === "new" ? counts?.unlistened
              : key === "creating" ? counts?.pending
              : key === "all" ? counts?.total
              : undefined;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
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
          No items match this filter.
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
                      onRemove={handleRemove}
                      onEpisodeVote={handleEpisodeVote}
                      onCancel={handleCancelRequest}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <CancelBlippDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
