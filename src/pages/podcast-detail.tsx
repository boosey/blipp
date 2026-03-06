import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import type { PodcastDetail as PodcastDetailType, EpisodeSummary } from "../types/user";

export function PodcastDetail() {
  const { podcastId } = useParams<{ podcastId: string }>();
  const apiFetch = useApiFetch();
  const [podcast, setPodcast] = useState<PodcastDetailType | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [requestingEpisodeId, setRequestingEpisodeId] = useState<string | null>(null);

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

  async function handleSubscribeToggle() {
    if (!podcast) return;
    setSubscribing(true);
    try {
      if (podcast.isSubscribed) {
        await apiFetch(`/podcasts/subscribe/${podcast.id}`, { method: "DELETE" });
      } else {
        await apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: podcast.feedUrl,
            title: podcast.title,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            podcastIndexId: podcast.podcastIndexId,
            author: podcast.author,
          }),
        });
      }
      setPodcast((prev) => prev ? { ...prev, isSubscribed: !prev.isSubscribed } : prev);
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCreateBriefing(episodeId: string) {
    setRequestingEpisodeId(episodeId);
    try {
      await apiFetch("/briefings/generate", {
        method: "POST",
        body: JSON.stringify({ episodeId }),
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
          <button
            onClick={handleSubscribeToggle}
            disabled={subscribing}
            className={`mt-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              podcast.isSubscribed
                ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                : "bg-white text-zinc-950 hover:bg-zinc-200"
            } disabled:opacity-50`}
          >
            {subscribing
              ? "..."
              : podcast.isSubscribed
                ? "Subscribed"
                : "Subscribe"}
          </button>
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
                  <button
                    onClick={() => handleCreateBriefing(ep.id)}
                    disabled={requestingEpisodeId === ep.id}
                    className="px-3 py-1.5 bg-white text-zinc-950 rounded text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {requestingEpisodeId === ep.id ? "..." : "Brief"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
