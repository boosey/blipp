import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useApiFetch } from "../lib/api";
import { usePlan } from "../contexts/plan-context";
import { useUpgradeModal } from "./upgrade-prompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { DURATION_TIERS } from "../lib/duration-tiers";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  isSubscribed: boolean;
  feedUrl?: string;
  onToggle?: () => void;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
  isSubscribed,
  feedUrl,
  onToggle,
}: PodcastCardProps) {
  const apiFetch = useApiFetch();
  const planUsage = usePlan();
  const { showUpgrade, UpgradeModalElement } = useUpgradeModal();
  const [loading, setLoading] = useState(false);
  const [showTierDialog, setShowTierDialog] = useState(false);
  const [selectedTier, setSelectedTier] = useState(5);

  async function handleSubscribe(durationTier: number) {
    setLoading(true);
    setShowTierDialog(false);
    try {
      await apiFetch("/podcasts/subscribe", {
        method: "POST",
        body: JSON.stringify({
          feedUrl: feedUrl || "",
          title,
          description,
          imageUrl,
          author,
          durationTier,
        }),
      });
      toast.success(`Subscribed to ${title}`);
      onToggle?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to subscribe");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await apiFetch(`/podcasts/subscribe/${id}`, { method: "DELETE" });
      toast.success(`Unsubscribed from ${title}`);
      onToggle?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unsubscribe");
    } finally {
      setLoading(false);
    }
  }

  function handleToggleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isSubscribed) {
      handleUnsubscribe(e);
    } else {
      // Check subscription limit
      if (
        planUsage.subscriptions.limit !== null &&
        planUsage.subscriptions.remaining !== null &&
        planUsage.subscriptions.remaining <= 0
      ) {
        showUpgrade(
          `Your ${planUsage.plan.name} plan allows ${planUsage.subscriptions.limit} podcast subscription${planUsage.subscriptions.limit !== 1 ? "s" : ""}. Upgrade to subscribe to more podcasts.`
        );
        return;
      }
      setShowTierDialog(true);
    }
  }

  return (
    <>
    <Link to={`/discover/${id}`}>
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-14 h-14 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-zinc-400">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-zinc-400 truncate">{author}</p>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{description}</p>
        </div>
        <button
          onClick={handleToggleClick}
          disabled={loading}
          className={`self-center px-3 py-1.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${
            isSubscribed
              ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              : "bg-white text-zinc-950 hover:bg-zinc-200"
          } disabled:opacity-50`}
        >
          {loading ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
        </button>

      </div>
    </Link>
    {UpgradeModalElement}
    <Dialog open={showTierDialog} onOpenChange={setShowTierDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Briefing Length</DialogTitle>
          <DialogDescription>
            How long should your briefings be for {title}?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2 py-2">
          {DURATION_TIERS.map((tier) => {
            const locked = tier > planUsage.maxDurationMinutes;
            return (
              <button
                key={tier}
                onClick={() => {
                  if (locked) {
                    showUpgrade(`Your plan supports briefings up to ${planUsage.maxDurationMinutes} minutes. Upgrade for longer briefings.`);
                    return;
                  }
                  setSelectedTier(tier);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                  locked
                    ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                    : selectedTier === tier
                      ? "bg-white text-zinc-950"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {tier}m
                {locked && <Lock className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowTierDialog(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleSubscribe(selectedTier)}>
            Subscribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
