import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Heart, Search, X, Loader2, Check, Headphones, Sparkles } from "lucide-react";
import { useApiFetch } from "../lib/api";
import { useFetch } from "../lib/use-fetch";
import { Skeleton } from "../components/ui/skeleton";
import { usePlan } from "../contexts/plan-context";
import { useUpgradeModal } from "../components/upgrade-prompt";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";
import { TierPicker } from "../components/tier-picker";
import { VoicePresetPicker } from "../components/voice-preset-picker";
import { ThumbButtons } from "../components/thumb-buttons";
import type { PodcastDetail as PodcastDetailType, EpisodeSummary } from "../types/user";
import type { DurationTier } from "../lib/duration-tiers";

export function PodcastDetail({ podcastId: propPodcastId, scrollToEpisodeId }: { podcastId?: string; scrollToEpisodeId?: string | null } = {}) {
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
  const [showChangeTierPicker, setShowChangeTierPicker] = useState(false);
  const [showChangeVoicePicker, setShowChangeVoicePicker] = useState(false);
  const [briefTierPickerEpisodeId, setBriefTierPickerEpisodeId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const planUsage = usePlan();
  const { showUpgrade, UpgradeModalElement } = useUpgradeModal();
  const { close: closeSheet } = usePodcastSheet();
  const { data: meData } = useFetch<{ user: { defaultDurationTier: number; acceptAnyVoice?: boolean } }>("/me");
  const defaultTier = (meData?.user?.defaultDurationTier ?? 5) as DurationTier;
  const userAcceptsAnyVoice = meData?.user?.acceptAnyVoice ?? false;
  const episodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Scroll to target episode after data loads
  useEffect(() => {
    if (!scrollToEpisodeId || loading || episodes.length === 0) return;
    const el = episodeRefs.current.get(scrollToEpisodeId);
    if (el) {
      // Small delay to ensure the sheet animation has settled
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [scrollToEpisodeId, loading, episodes]);

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
          ? { ...prev, isSubscribed: true, subscriptionDurationTier: tier, subscriptionVoicePresetId: null }
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
          ? { ...prev, isSubscribed: false, subscriptionDurationTier: null, subscriptionVoicePresetId: null }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unsubscribe");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleChangeTier(tier: DurationTier) {
    if (!podcast) return;
    setShowChangeTierPicker(false);
    try {
      await apiFetch(`/podcasts/subscribe/${podcast.id}`, {
        method: "PATCH",
        body: JSON.stringify({ durationTier: tier }),
      });
      toast.success(`Briefing length updated to ${tier}m`);
      setPodcast((prev) =>
        prev ? { ...prev, subscriptionDurationTier: tier } : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleChangeVoice(voicePresetId: string | null) {
    if (!podcast) return;
    setShowChangeVoicePicker(false);
    try {
      await apiFetch(`/podcasts/subscribe/${podcast.id}`, {
        method: "PATCH",
        body: JSON.stringify({ voicePresetId }),
      });
      toast.success(voicePresetId ? "Voice updated" : "Voice reset to default");
      setPodcast((prev) =>
        prev ? { ...prev, subscriptionVoicePresetId: voicePresetId } : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleCreateBriefing(episodeId: string, tier: DurationTier, silent = false) {
    setRequestingEpisodeId(episodeId);
    setBriefTierPickerEpisodeId(null);
    try {
      // Check availability before creating
      let availabilityMsg = `${tier}m Blipp requested — usually ready in 2-5 minutes`;
      try {
        const avail = await apiFetch<{
          available: boolean;
          matchType: "exact" | "any_voice" | null;
          estimatedWaitSeconds: number | null;
          voicePresetName: string | null;
        }>(`/blipps/availability?episodeId=${episodeId}&durationTier=${tier}`);
        if (avail.available) {
          availabilityMsg = avail.matchType === "any_voice"
            ? `Ready in seconds — available in ${avail.voicePresetName ?? "another"} voice`
            : "Ready in seconds";
        } else if (!userAcceptsAnyVoice) {
          availabilityMsg = "This will take a few minutes. Enable \"Accept any voice\" in Settings for faster delivery";
        }
      } catch {
        // Availability endpoint may not exist yet — fall through with default message
      }

      await apiFetch("/briefings/generate", {
        method: "POST",
        body: JSON.stringify({ podcastId, episodeId, durationTier: tier }),
      });
      // Optimistically mark episode as having a pending blipp
      setEpisodes((eps) =>
        eps.map((e) =>
          e.id === episodeId
            ? { ...e, blippStatus: { status: "PENDING" as const, listened: false } }
            : e
        )
      );
      if (!silent) {
        toast(availabilityMsg, { duration: 4000 });
      }
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

  async function handlePodcastVote(vote: number) {
    if (!podcast) return;
    const prev = podcast.userVote;
    setPodcast((p) => p ? { ...p, userVote: vote } : p);
    try {
      await apiFetch(`/podcasts/vote/${podcast.id}`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
    } catch {
      setPodcast((p) => p ? { ...p, userVote: prev } : p);
    }
  }

  async function handleEpisodeVote(episodeId: string, vote: number) {
    const prev = episodes.find((e) => e.id === episodeId)?.userVote ?? 0;
    setEpisodes((eps) =>
      eps.map((e) => (e.id === episodeId ? { ...e, userVote: vote } : e))
    );
    try {
      await apiFetch(`/podcasts/episodes/vote/${episodeId}`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
    } catch {
      setEpisodes((eps) =>
        eps.map((e) => (e.id === episodeId ? { ...e, userVote: prev } : e))
      );
    }
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  }

  if (loading) {
    return (
      <div className="space-y-6 min-w-0 overflow-hidden">
        <div className="space-y-3">
          <Skeleton className="w-24 h-24 rounded-lg" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3">
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
        <p className="text-muted-foreground">Podcast not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      {UpgradeModalElement}
      {/* Podcast header */}
      <div className="space-y-3">
        {/* Image row: artwork + action buttons */}
        <div className="flex items-start gap-4">
          {podcast.imageUrl ? (
            <img
              src={podcast.imageUrl}
              alt={podcast.title}
              className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0" />
          )}
          <div className="flex items-center gap-0.5 ml-auto pt-1">
            <ThumbButtons vote={podcast.userVote} onVote={handlePodcastVote} />
            <button
              onClick={toggleFavorite}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${isFavorited ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
              />
            </button>
          </div>
        </div>

        {/* Title + meta — full width */}
        <div>
          <h1
            className={`text-base font-bold break-words cursor-pointer ${titleExpanded ? "" : "line-clamp-2"}`}
            onClick={() => setTitleExpanded(!titleExpanded)}
          >
            {podcast.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[podcast.author, `${podcast.episodeCount} episodes`].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Subscribe / Unsubscribe + tier */}
        {podcast.isSubscribed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleUnsubscribe}
                disabled={subscribing}
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-muted text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {subscribing ? "..." : "Unsubscribe"}
              </button>
              {podcast.subscriptionDurationTier && (
                <button
                  onClick={() => { setShowChangeTierPicker(!showChangeTierPicker); setShowChangeVoicePicker(false); }}
                  className="text-[10px] font-medium text-muted-foreground bg-muted hover:bg-accent px-1.5 py-0.5 rounded transition-colors"
                >
                  {podcast.subscriptionDurationTier}m
                </button>
              )}
              <button
                onClick={() => { setShowChangeVoicePicker(!showChangeVoicePicker); setShowChangeTierPicker(false); }}
                className="text-[10px] font-medium text-muted-foreground bg-muted hover:bg-accent px-1.5 py-0.5 rounded transition-colors"
              >
                Voice
              </button>
            </div>
            {showChangeTierPicker && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Change briefing length:</p>
                <TierPicker
                  selected={(podcast.subscriptionDurationTier as DurationTier) ?? null}
                  onSelect={handleChangeTier}
                  maxDurationMinutes={planUsage.maxDurationMinutes}
                  onUpgrade={showUpgrade}
                />
              </div>
            )}
            {showChangeVoicePicker && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Change voice:</p>
                <VoicePresetPicker
                  selected={podcast.subscriptionVoicePresetId}
                  onSelect={handleChangeVoice}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            {planUsage.subscriptions.limit !== null &&
              planUsage.subscriptions.remaining !== null &&
              planUsage.subscriptions.remaining <= 0 ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">Subscription limit reached</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Your plan allows {planUsage.subscriptions.limit} subscription{planUsage.subscriptions.limit !== 1 ? "s" : ""}. Upgrade or remove one to add this podcast.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => showUpgrade("You've reached your subscription limit. Upgrade your plan to subscribe to more podcasts.")}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Upgrade
                  </button>
                  <button
                    onClick={() => navigate("/library")}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Manage Subscriptions
                  </button>
                </div>
              </div>
            ) : showSubscribeTierPicker ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Briefing length:</p>
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
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {subscribing ? "..." : "Subscribe"}
              </button>
            )}
          </div>
        )}

        {/* Description */}
        {podcast.description && (
          <p
            className={`text-sm text-muted-foreground break-words cursor-pointer ${descExpanded ? "" : "line-clamp-3"}`}
            onClick={() => setDescExpanded(!descExpanded)}
          >
            {podcast.description.replace(/<[^>]*>/g, "")}
          </p>
        )}
      </div>

      {/* Episodes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          {searchOpen ? (
            <div className="flex-1 flex items-center gap-2 bg-muted/80 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={episodeSearch}
                onChange={(e) => setEpisodeSearch(e.target.value)}
                placeholder="Search episodes..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                autoFocus
              />
              <button
                onClick={() => { setEpisodeSearch(""); setSearchOpen(false); }}
                className="p-0.5 rounded hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold flex-1">Episodes</h2>
              {episodes.length > 0 && (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
        {episodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No episodes yet. Episodes appear after a feed refresh.
          </p>
        ) : (
          <div className="space-y-2">
            {episodes
              .map((ep, idx) => ({ ep, idx }))
              .filter(({ ep }) => {
                if (!episodeSearch) return true;
                const q = episodeSearch.toLowerCase();
                return ep.title.toLowerCase().includes(q) ||
                  ep.description?.toLowerCase().includes(q);
              })
              .map(({ ep, idx }) => {
              const lockedByPlan = planUsage.pastEpisodesLimit !== null && idx >= planUsage.pastEpisodesLimit;
              return (
              <div
                key={ep.id}
                ref={(el) => { if (el) episodeRefs.current.set(ep.id, el); }}
                className={`bg-card border rounded-lg p-3 ${scrollToEpisodeId === ep.id ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}
              >
                {/* Title — full width, expandable */}
                <div
                  className="w-full cursor-pointer"
                  onClick={() => setExpandedEpisodeId(
                    expandedEpisodeId === ep.id ? null : ep.id
                  )}
                >
                  <p className={`font-medium text-sm text-violet-600 dark:text-violet-300 break-words ${expandedEpisodeId === ep.id ? "" : "line-clamp-2"}`}>
                    {ep.title}
                  </p>
                </div>
                {/* Meta */}
                <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                  <span>{new Date(ep.publishedAt).toLocaleDateString()}</span>
                  {ep.durationSeconds && <span>{formatDuration(ep.durationSeconds)}</span>}
                </div>
                {/* Description — expandable */}
                {ep.description && (
                  <div
                    className="w-full cursor-pointer mt-1.5"
                    onClick={() => setExpandedEpisodeId(
                      expandedEpisodeId === ep.id ? null : ep.id
                    )}
                  >
                    <p className={`text-xs text-muted-foreground break-words ${expandedEpisodeId === ep.id ? "" : "line-clamp-5"}`}>
                      {ep.description.replace(/<[^>]*>/g, "")}
                    </p>
                  </div>
                )}
                {/* Action row: thumbs left, blipp right */}
                <div className="flex items-center justify-between mt-2">
                  <ThumbButtons
                    vote={ep.userVote}
                    onVote={(v) => handleEpisodeVote(ep.id, v)}
                  />
                  <div className="relative">
                    {requestingEpisodeId === ep.id ? (
                      <span className="text-xs text-muted-foreground px-3 py-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </span>
                    ) : ep.blippStatus?.status === "PENDING" || ep.blippStatus?.status === "PROCESSING" ? (
                      <span className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-yellow-500/15 text-yellow-400" title="Usually ready in 2-5 minutes">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Creating...
                      </span>
                    ) : ep.blippStatus?.status === "READY" ? (
                      <span className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium ${
                        ep.blippStatus.listened
                          ? "bg-muted text-muted-foreground"
                          : "bg-green-500/15 text-green-400"
                      }`}>
                        {ep.blippStatus.listened
                          ? <><Check className="w-3 h-3" /> Listened</>
                          : <><Headphones className="w-3 h-3" /> In Feed</>
                        }
                      </span>
                    ) : ep.blippStatus?.status === "FAILED" ? (
                      <button
                        onClick={() => {
                          if (defaultTier > planUsage.maxDurationMinutes) {
                            showUpgrade(`Your plan supports briefings up to ${planUsage.maxDurationMinutes} minutes. Upgrade for longer briefings.`);
                            return;
                          }
                          handleCreateBriefing(ep.id, defaultTier, true);
                          toast(`${defaultTier}m Blipp requested — usually ready in 2-5 minutes`, {
                            duration: 5000,
                          });
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        Retry
                      </button>
                    ) : lockedByPlan ? (
                      <button
                        onClick={() => showUpgrade(`Your plan allows access to the ${planUsage.pastEpisodesLimit} most recent episodes. Upgrade for full archive access.`)}
                        className="px-3 py-1.5 bg-muted text-muted-foreground rounded text-xs font-medium hover:bg-muted/80 transition-colors select-none cursor-not-allowed opacity-60"
                        title="Upgrade to access older episodes"
                      >
                        Blipp
                      </button>
                    ) : (
                      <button
                        onClick={() => setBriefTierPickerEpisodeId(
                          briefTierPickerEpisodeId === ep.id ? null : ep.id
                        )}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors select-none"
                        title="Create a bite-sized briefing"
                      >
                        Blipp
                      </button>
                    )}
                    {briefTierPickerEpisodeId === ep.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setBriefTierPickerEpisodeId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1.5 z-50 bg-card/90 backdrop-blur-md border border-border rounded-lg p-2 shadow-xl shadow-black/40">
                          <TierPicker
                            selected={defaultTier}
                            onSelect={(tier) => handleCreateBriefing(ep.id, tier)}
                            maxDurationMinutes={planUsage.maxDurationMinutes}
                            onUpgrade={showUpgrade}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );})
            }
          </div>
        )}
      </div>
    </div>
  );
}
