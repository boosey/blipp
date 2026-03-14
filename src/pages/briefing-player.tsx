import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { useAudio } from "../contexts/audio-context";
import { PlayerSkeleton } from "../components/skeletons/player-skeleton";
import type { FeedItem } from "../types/feed";

export function BriefingPlayer() {
  const { feedItemId } = useParams<{ feedItemId: string }>();
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const audio = useAudio();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!feedItemId) {
      navigate("/home", { replace: true });
      return;
    }

    apiFetch<{ item: FeedItem }>(`/feed/${feedItemId}`)
      .then((data) => {
        if (data.item.briefing) {
          audio.play(data.item);
        }
        navigate("/home", { replace: true });
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load briefing");
        setError(true);
        setLoading(false);
      });
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedItemId]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Briefing not available.</p>
      </div>
    );
  }

  if (loading) {
    return <PlayerSkeleton />;
  }

  return null;
}
