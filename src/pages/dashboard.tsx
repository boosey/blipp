import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { BriefingPlayer, type BriefingSegment } from "../components/briefing-player";

/** Shape of the briefing response from the API. */
interface Briefing {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  audioUrl?: string;
  title?: string;
  segments?: BriefingSegment[];
}

/** Dashboard page that shows today's briefing or a generate button. */
export function Dashboard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchBriefing = useCallback(async () => {
    try {
      const data = await apiFetch<Briefing>("/briefings/today");
      setBriefing(data);
      return data;
    } catch {
      // No briefing for today — that's ok
      setBriefing(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  // Poll every 5s while briefing is processing
  useEffect(() => {
    if (!briefing || briefing.status === "COMPLETED" || briefing.status === "FAILED") return;

    const interval = setInterval(async () => {
      const updated = await fetchBriefing();
      if (updated?.status === "COMPLETED" || updated?.status === "FAILED") {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [briefing?.status, fetchBriefing]);

  /** Triggers briefing generation and starts polling. */
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch<Briefing>("/briefings/generate", {
        method: "POST",
      });
      setBriefing(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate briefing");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400" data-testid="loading">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-zinc-400">No briefing for today yet.</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Briefing"}
        </button>
      </div>
    );
  }

  if (briefing.status === "PENDING" || briefing.status === "PROCESSING") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Your briefing is being generated...</p>
      </div>
    );
  }

  if (briefing.status === "FAILED") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-400">Briefing generation failed.</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-6 py-3 bg-zinc-50 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <BriefingPlayer
      audioUrl={briefing.audioUrl!}
      title={briefing.title || "Today's Briefing"}
      segments={briefing.segments || []}
    />
  );
}
