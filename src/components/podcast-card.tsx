import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";
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
      onToggle?.();
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
      onToggle?.();
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
      setShowTierDialog(true);
    }
  }

  return (
    <Link to={`/discover/${id}`}>
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <img
          src={imageUrl}
          alt={title}
          className="w-14 h-14 rounded object-cover flex-shrink-0"
        />
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

        <Dialog open={showTierDialog} onOpenChange={setShowTierDialog}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Briefing Length</DialogTitle>
              <DialogDescription>
                How long should your briefings be for {title}?
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2 py-2">
              {DURATION_TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTier === tier
                      ? "bg-white text-zinc-950"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {tier}m
                </button>
              ))}
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
      </div>
    </Link>
  );
}
