import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import type { FeedItem } from "../types/feed";

export function BriefingPlayer() {
  const { feedItemId } = useParams<{ feedItemId: string }>();
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [item, setItem] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!feedItemId) return;
    apiFetch<{ item: FeedItem }>(`/feed/${feedItemId}`)
      .then((data) => {
        setItem(data.item);
        // Auto-mark as listened if ready and not already listened
        if (data.item.status === "READY" && !data.item.listened) {
          apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(
            () => {}
          );
        }
      })
      .catch(() => navigate("/home"))
      .finally(() => setLoading(false));
  }, [feedItemId, apiFetch, navigate]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function cyclePlaybackRate() {
    const rates = [1, 1.25, 1.5, 2];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!item || !item.briefing?.clip?.audioUrl) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Briefing not available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4">
      {/* Artwork */}
      {item.podcast.imageUrl ? (
        <img
          src={item.podcast.imageUrl}
          alt=""
          className="w-48 h-48 rounded-2xl object-cover shadow-lg"
        />
      ) : (
        <div className="w-48 h-48 rounded-2xl bg-zinc-800" />
      )}

      {/* Title info */}
      <div className="text-center">
        <h1 className="text-lg font-bold">
          {item.episode.title || "Briefing"}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{item.podcast.title}</p>
        <p className="text-xs text-zinc-500 mt-1">{item.durationTier}m briefing</p>
      </div>

      {/* Audio element */}
      <audio
        ref={audioRef}
        src={item.briefing!.clip.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Seek bar */}
      <div className="w-full max-w-sm">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-zinc-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <button
          onClick={cyclePlaybackRate}
          className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded"
        >
          {playbackRate}x
        </button>
        <button
          onClick={togglePlayback}
          className="w-14 h-14 flex items-center justify-center bg-white text-zinc-950 rounded-full font-bold text-lg"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "||" : "\u25B6"}
        </button>
        <div className="w-10" />
      </div>
    </div>
  );
}
