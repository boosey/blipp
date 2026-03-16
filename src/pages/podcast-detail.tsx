import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Heart, Lock } from "lucide-react";
import { useApiFetch } from "../lib/api";
import { DURATION_TIERS } from "../lib/duration-tiers";
import { Skeleton } from "../components/ui/skeleton";
import { usePlan } from "../contexts/plan-context";
import { useUpgradeModal } from "../components/upgrade-prompt";
import type { PodcastDetail as PodcastDetailType, EpisodeSummary } from "../types/user";
import type { DurationTier } from "../lib/duration-tiers";

function TierPicker({
  selected,
  onSelect,
  maxDurationMinutes,
  onUpgrade,
}: {
  selected: DurationTier | null;
  onSelect: (tier: DurationTier) => void;
  maxDurationMinutes: number;
  onUpgrade?: (msg: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DURATION_TIERS.map((tier) => {
        const locked = tier > maxDurationMinutes;
        return (
          <button
            key={tier}
            onClick={() => {
              if (locked) {
                onUpgrade?.(`Your plan supports briefings up to ${maxDurationMinutes} minutes. Upgrade for longer briefings.`);
                return;
              }
              onSelect(tier);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              locked
                ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                : selected === tier
                  ? "bg-white text-zinc-950"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {tier}m
            {locked && <Lock className="w-2.5 h-2.5" />}
          </button>
        );
      })}
    </div>
  );
}

export function PodcastDetail({ podcastId: propPodcastId }: { podcastId?: string } = {}) {
  const { podcastId: routePodcastId } = useParams<{ podcastId: string }>();
  const podcastId = propPodcastId || routePodcastId;
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const [podcast, setPodcast] = useState<PodcastDetailType | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [requestingEpisodeId, setRequestingEpisodeId] = useState<string | null>(null);
  const [showSubscribeTierPicker, setShowSubscribeTierPicker] = useState(false);
  const [briefTierPickerEpisodeId, setBriefTierPickerEpisodeId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);
  const planUsage = usePlan();
  const { showUpgrade, UpgradeModalElement } = useUpgradeModal();

  const fetchData = useCallback(async () => {
    if (!podcastId) return;
    try {
      const [podData, epData, favData] = await Promise.all([
        apiFetch<{ podcast: PodcastDetailType }>(`/podcasts/${podcastId}`),
        apiFetch<{ episodes: EpisodeSummary[] }>(`/podcasts/${podcastId}/episodes`),
        apiFetch<{ data: { id: string }[] }>("/podcasts/favorites").catch(() => ({ data: [] })),
      ]);
      setPodcast(podData.podcast);
      setEpisodes(epData.episodes);
      setIsFavorited(favData.data.some((f) => f.id === podcastId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load podcast");
    } finally {
      setLoading(false);
    }
  }, [podcastId, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubscribeWithTier(tier: DurationTier) {
    if (!podcast) return;
    setSubscribing(true);
    setShowSubscribeTierPicker(false);
    try {
      await apiFetch("/podcasts/subscribe", {
        method: "POST",
        body: JSON.stringify({
          feedUrl: podcast.feedUrl,
          title: podcast.title,
          description: podcast.description,
          imageUrl: podcast.imageUrl,
          podcastIndexId: podcast.podcastIndexId,
          author: podcast.author,
          durationTier: tier,
        }),
      });
      toast.success(`Subscribed to ${podcast.title}`);
      setPodcast((prev) =>
        prev
          ? { ...prev, isSubscribed: true, subscriptionDurationTier: tier }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleUnsubscribe() {
    if (!podcast) return;
    setSubscribing(true);
    try {
      await apiFetch(`/podcasts/subscribe/${podcast.id}`, { method: "DELETE" });
      toast.success(`Unsubscribed from ${podcast.title}`);
      setPodcast((prev) =>
        prev
          ? { ...prev, isSubscribed: false, subscriptionDurationTier: null }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unsubscribe");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCreateBriefing(episodeId: string, tier: DurationTier) {
    setRequestingEpisodeId(episodeId);
    setBriefTierPickerEpisodeId(null);
    try {
      await apiFetch("/briefings/generate", {
        method: "POST",
        body: JSON.stringify({ podcastId, episodeId, durationTier: tier }),
      });
      toast("Briefing requested — usually ready in 2-5 minutes", { duration: 4000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to request briefing");
    } finally {
      setRequestingEpisodeId(null);
    }
  }

  async function toggleFavorite() {
    if (!podcast) return;
    try {
      if (isFavorited) {
        await apiFetch(`/podcasts/favorites/${podcast.id}`, { method: "DELETE" });
        setIsFavorited(false);
        toast.success(`Removed from favorites`);
      } else {
        await apiFetch(`/podcasts/favorites/${podcast.id}`, { method: "POST" });
        setIsFavorited(true);
        toast.success(`Added to favorites`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update favorites");
    }
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-4">
          <Skeleton className="w-24 h-24 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24 rounded-full mt-2" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-7 w-14 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Podcast not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {UpgradeModalElement}
      {/* Podcast header */}
      <div className="flex gap-4">
        {podcast.imageUrl ? (
          <img
            src={podcast.imageUrl}
            alt={podcast.title}
            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-zinc-800 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold">{podcast.title}</h1>
            <button
              onClick={toggleFavorite}
              className="p-1.5 rounded-full hover:bg-zinc-800 transition-colors flex-shrink-0"
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart
                className={`w-5 h-5 transition-colors ${isFavorited ? "fill-red-500 text-red-500" : "text-zinc-500"}`}
              />
            </button>
          </div>
          {podcast.author && (
            <p className="text-sm text-zinc-400">{podcast.author}</p>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            {podcast.episodeCount} episodes
          </p>

          {/* Subscribe / Subscribed button */}
          {podcast.isSubscribed ? (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleUnsubscribe}
                disabled={subscribing}
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {subscribing ? "..." : "Subscribed"}
              </button>
              {podcast.subscriptionDurationTier && (
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {podcast.subscriptionDurationTier}m
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2">
              {planUsage.subscriptions.limit !== null &&
                planUsage.subscriptions.remaining !== null &&
                planUsage.subscriptions.remaining <= 0 ? (
                <button
                  onClick={() => navigate("/settings")}
                  className="px-4 py-1.5 rounded-full text-xs font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
                >
                  Upgrade to Subscribe
                </button>
              ) : showSubscribeTierPicker ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Briefing length:</p>
                  <TierPicker
                    selected={null}
                    onSelect={handleSubscribeWithTier}
                    maxDurationMinutes={planUsage.maxDurationMinutes}
                    onUpgrade={showUpgrade}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowSubscribeTierPicker(true)}
                  disabled={subscribing}
                  className="px-4 py-1.5 rounded-full text-xs font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {subscribing ? "..." : "Subscribe"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {podcast.description && (
        <p className="text-sm text-zinc-400 line-clamp-4">
          {podcast.description}
        </p>
      )}

      {/* Episodes */}
      <div>
        <h2 className="text-base font-semibold mb-3">Episodes</h2>
        {episodes.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No episodes yet. Episodes appear after a feed refresh.
          </p>
        ) : (
          <div className="space-y-2">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpandedEpisodeId(
                      expandedEpisodeId === ep.id ? null : ep.id
                    )}
                  >
                    <p className="font-medium text-sm">{ep.title}</p>
                    <div className="flex gap-2 text-xs text-zinc-500 mt-1">
                      <span>
                        {new Date(ep.publishedAt).toLocaleDateString()}
                      </span>
                      {ep.durationSeconds && (
                        <span>{formatDuration(ep.durationSeconds)}</span>
                      )}
                    </div>
                    {ep.description && (
                      <p className={`text-xs text-zinc-500 mt-2 ${
                        expandedEpisodeId === ep.id ? "" : "line-clamp-2"
                      }`}>
                        {ep.description}
                      </p>
                    )}
                  </button>
                  {requestingEpisodeId === ep.id ? (
                    <span className="text-xs text-zinc-500 px-3 py-1.5">
                      ...
                    </span>
                  ) : briefTierPickerEpisodeId === ep.id ? (
                    <div className="flex-shrink-0">
                      <TierPicker
                        selected={null}
                        onSelect={(tier) => handleCreateBriefing(ep.id, tier)}
                        maxDurationMinutes={planUsage.maxDurationMinutes}
                        onUpgrade={showUpgrade}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setBriefTierPickerEpisodeId(ep.id)}
                      className="px-3 py-1.5 bg-white text-zinc-950 rounded text-xs font-medium hover:bg-zinc-200 transition-colors flex-shrink-0"
                    >
                      Blipp
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
