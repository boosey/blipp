import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBase } from "@/lib/api-base";
import { formatBytes } from "@/lib/admin-formatters";

/** Audio player that fetches audio from the admin API with auth. */
export function AudioPlayer({ wpId, sizeBytes }: { wpId: string; sizeBytes?: number }) {
  const { getToken } = useAuth();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAudio = useCallback(async () => {
    if (audioUrl || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/admin/requests/work-product/${wpId}/audio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [getToken, wpId, audioUrl, isLoading]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (loadError) {
    return (
      <div className="px-2.5 py-2 text-[10px] text-[#EF4444]">
        Failed to load audio: {loadError}
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="px-2.5 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={loadAudio}
          disabled={isLoading}
          className="h-6 text-[10px] text-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/10"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <FileAudio className="h-3 w-3 mr-1" />
          )}
          {isLoading ? "Loading..." : "Load audio"}
        </Button>
        {sizeBytes != null && (
          <span className="text-[9px] text-[#9CA3AF] font-mono">{formatBytes(sizeBytes)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="px-2.5 py-2">
      <audio controls className="w-full h-8" style={{ filter: "invert(0.85) hue-rotate(180deg)" }}>
        <source src={audioUrl} type="audio/mpeg" />
      </audio>
    </div>
  );
}

/** Audio player that streams source audio from the episode's podcast CDN via proxy. */
export function SourceAudioPlayer({ episodeId }: { episodeId: string }) {
  const { getToken } = useAuth();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAudio = useCallback(async () => {
    if (audioUrl || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/admin/requests/episode/${episodeId}/source-audio`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [getToken, episodeId, audioUrl, isLoading]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (loadError) {
    return (
      <div className="px-2.5 py-2 text-[10px] text-[#EF4444]">
        Failed to load source audio: {loadError}
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="px-2.5 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={loadAudio}
          disabled={isLoading}
          className="h-6 text-[10px] text-[#F97316] hover:text-[#F97316] hover:bg-[#F97316]/10"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <FileAudio className="h-3 w-3 mr-1" />
          )}
          {isLoading ? "Loading..." : "Load source audio"}
        </Button>
      </div>
    );
  }

  return (
    <div className="px-2.5 py-2">
      <audio controls className="w-full h-8" style={{ filter: "invert(0.85) hue-rotate(180deg)" }}>
        <source src={audioUrl} type="audio/mpeg" />
      </audio>
    </div>
  );
}
