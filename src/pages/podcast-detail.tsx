import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import { DURATION_TIERS } from "../lib/duration-tiers";
import type { PodcastDetail as PodcastDetailType, EpisodeSummary } from "../types/user";
import type { DurationTier } from "../lib/duration-tiers";

function TierPicker({
  selected,
  onSelect,
}: {
  selected: DurationTier | null;
  onSelect: (tier: DurationTier) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DURATION_TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => onSelect(tier)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            selected === tier
              ? "bg-white text-zinc-950"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {tier}m
        </button>
      ))}
    </div>
  );
}

export function PodcastDetail() {
  const { podcastId } = useParams<{ podcastId: string }>();
  const apiFetch = useApiFetch();
  const [podcast, setPodcast] = useState<PodcastDetailType | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [requestingEpisodeId, setRequestingEpisodeId] = useState<string | null>(null);
  const [showSubscribeTierPicker, setShowSubscribeTierPicker] = useState(false);
  const [briefTierPickerEpisodeId, setBriefTierPickerEpisodeId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!podcastId) return;
    try {
      const [podData, epData] = await Promise.all([
        apiFetch<{ podcast: PodcastDetailType }>(`/podcasts/${podcastId}`),
        apiFetch<{ episodes: EpisodeSummary[] }>(`/podcasts/${podcastId}/episodes`),
      ]);
      setPodcast(podData.podcast);
      setEpisodes(epData.episodes);
    } catch {
      // Handle error
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
      setPodcast((prev) =>
        prev
          ? { ...prev, isSubscribed: true, subscriptionDurationTier: tier }
          : prev
      );
    } finally {
      setSubscribing(false);
    }
  }

  async function handleUnsubscribe() {
    if (!podcast) return;
    setSubscribing(true);
    try {
      await apiFetch(`/podcasts/subscribe/${podcast.id}`, { method: "DELETE" });
      setPodcast((prev) =>
        prev
          ? { ...prev, isSubscribed: false, subscriptionDurationTier: null }
          : prev
      );
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
    } finally {
      setRequestingEpisodeId(null);
    }
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
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
          <h1 className="text-lg font-bold">{podcast.title}</h1>
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
              {showSubscribeTierPicker ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Briefing length:</p>
                  <TierPicker
                    selected={null}
                    onSelect={handleSubscribeWithTier}
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
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{ep.title}</p>
                    <div className="flex gap-2 text-xs text-zinc-500 mt-1">
                      <span>
                        {new Date(ep.publishedAt).toLocaleDateString()}
                      </span>
                      {ep.durationSeconds && (
                        <span>{formatDuration(ep.durationSeconds)}</span>
                      )}
                    </div>
                  </div>
                  {requestingEpisodeId === ep.id ? (
                    <span className="text-xs text-zinc-500 px-3 py-1.5">
                      ...
                    </span>
                  ) : briefTierPickerEpisodeId === ep.id ? (
                    <div className="flex-shrink-0">
                      <TierPicker
                        selected={null}
                        onSelect={(tier) => handleCreateBriefing(ep.id, tier)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setBriefTierPickerEpisodeId(ep.id)}
                      className="px-3 py-1.5 bg-white text-zinc-950 rounded text-xs font-medium hover:bg-zinc-200 transition-colors flex-shrink-0"
                    >
                      Brief
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
