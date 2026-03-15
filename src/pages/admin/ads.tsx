import { useState, useEffect, useCallback } from "react";
import { Megaphone, Save, PlayCircle, Info, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminFetch } from "@/lib/admin-api";

interface ConfigEntry {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

function AdsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48 bg-white/5" />
      <Skeleton className="h-4 w-72 bg-white/5" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

/** Parse config entries into form state */
function parseEntries(entries: ConfigEntry[]) {
  const map = new Map(entries.map((e) => [e.key, e.value]));
  return {
    adsEnabled: (map.get("ads.enabled") as boolean) ?? false,
    prerollEnabled: (map.get("ads.preroll.enabled") as boolean) ?? false,
    prerollVastUrl: (map.get("ads.preroll.vastUrl") as string) ?? "",
    postrollEnabled: (map.get("ads.postroll.enabled") as boolean) ?? false,
    postrollVastUrl: (map.get("ads.postroll.vastUrl") as string) ?? "",
  };
}

export default function Ads() {
  const apiFetch = useAdminFetch();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"preroll" | "postroll" | null>(null);
  const [testResult, setTestResult] = useState<{ placement: string; valid: boolean; error?: string } | null>(null);

  // Saved state (from server)
  const [saved, setSaved] = useState({
    adsEnabled: false,
    prerollEnabled: false,
    prerollVastUrl: "",
    postrollEnabled: false,
    postrollVastUrl: "",
  });

  // Local form state
  const [adsEnabled, setAdsEnabled] = useState(false);
  const [prerollEnabled, setPrerollEnabled] = useState(false);
  const [prerollVastUrl, setPrerollVastUrl] = useState("");
  const [postrollEnabled, setPostrollEnabled] = useState(false);
  const [postrollVastUrl, setPostrollVastUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ConfigEntry[] }>("/ads");
      const parsed = parseEntries(res.data);
      setSaved(parsed);
      setAdsEnabled(parsed.adsEnabled);
      setPrerollEnabled(parsed.prerollEnabled);
      setPrerollVastUrl(parsed.prerollVastUrl);
      setPostrollEnabled(parsed.postrollEnabled);
      setPostrollVastUrl(parsed.postrollVastUrl);
      setLoaded(true);
    } catch (e) {
      console.error("Failed to load ad config:", e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Save each config key individually
      const updates: Array<{ key: string; value: unknown }> = [
        { key: "ads.enabled", value: adsEnabled },
        { key: "ads.preroll.enabled", value: prerollEnabled },
        { key: "ads.preroll.vastUrl", value: prerollVastUrl || "" },
        { key: "ads.postroll.enabled", value: postrollEnabled },
        { key: "ads.postroll.vastUrl", value: postrollVastUrl || "" },
      ];

      await Promise.all(
        updates.map(({ key, value }) =>
          apiFetch("/ads", {
            method: "PUT",
            body: JSON.stringify({ key, value }),
          })
        )
      );

      await load();
    } catch (e) {
      console.error("Failed to save ad config:", e);
    } finally {
      setSaving(false);
    }
  }, [apiFetch, adsEnabled, prerollEnabled, prerollVastUrl, postrollEnabled, postrollVastUrl, load]);

  const handleTest = useCallback(
    async (placement: "preroll" | "postroll") => {
      const url = placement === "preroll" ? prerollVastUrl : postrollVastUrl;
      if (!url) return;

      setTesting(placement);
      setTestResult(null);
      try {
        const res = await apiFetch<{ valid: boolean; error?: string }>("/ads/test-vast", {
          method: "POST",
          body: JSON.stringify({ url }),
        });
        setTestResult({ placement, valid: res.valid, error: res.error });
      } catch (e) {
        setTestResult({ placement, valid: false, error: e instanceof Error ? e.message : "Test failed" });
      } finally {
        setTesting(null);
      }
    },
    [apiFetch, prerollVastUrl, postrollVastUrl]
  );

  if (loading && !loaded) return <AdsSkeleton />;

  const hasChanges =
    adsEnabled !== saved.adsEnabled ||
    prerollEnabled !== saved.prerollEnabled ||
    prerollVastUrl !== saved.prerollVastUrl ||
    postrollEnabled !== saved.postrollEnabled ||
    postrollVastUrl !== saved.postrollVastUrl;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#F9FAFB]">Advertisements</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Configure pre-roll and post-roll ad placements
          </p>
        </div>
        <Button
          size="sm"
          disabled={saving || !hasChanges}
          onClick={handleSave}
          className="bg-[#F97316] hover:bg-[#F97316]/80 text-white text-xs gap-1.5"
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Global toggle */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-[#F97316]" />
          <div>
            <span className="text-sm font-medium text-[#F9FAFB]">Ads Enabled</span>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
              Master toggle — disabling stops all ad serving
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={
              adsEnabled
                ? "bg-[#10B981]/15 text-[#10B981] text-[10px]"
                : "bg-white/5 text-[#9CA3AF] text-[10px]"
            }
          >
            {adsEnabled ? "ON" : "OFF"}
          </Badge>
          <Switch
            checked={adsEnabled}
            onCheckedChange={setAdsEnabled}
            className="data-[state=checked]:bg-[#F97316]"
          />
        </div>
      </div>

      {/* Pre-roll card */}
      <AdPlacementCard
        title="Pre-roll"
        description="Plays before the briefing content"
        enabled={prerollEnabled}
        onEnabledChange={setPrerollEnabled}
        vastUrl={prerollVastUrl}
        onVastUrlChange={(v) => { setPrerollVastUrl(v); setTestResult(null); }}
        onTest={() => handleTest("preroll")}
        isTesting={testing === "preroll"}
        testResult={testResult?.placement === "preroll" ? testResult : null}
        disabled={!adsEnabled}
      />

      {/* Post-roll card */}
      <AdPlacementCard
        title="Post-roll"
        description="Plays after the briefing content"
        enabled={postrollEnabled}
        onEnabledChange={setPostrollEnabled}
        vastUrl={postrollVastUrl}
        onVastUrlChange={(v) => { setPostrollVastUrl(v); setTestResult(null); }}
        onTest={() => handleTest("postroll")}
        isTesting={testing === "postroll"}
        testResult={testResult?.placement === "postroll" ? testResult : null}
        disabled={!adsEnabled}
      />

      {/* Template variables reference */}
      <div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-[#3B82F6]" />
          <span className="text-sm font-medium text-[#F9FAFB]">VAST URL Template Variables</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["[CACHE_BUSTER]", "Random value for cache busting"],
            ["[CONTENT_ID]", "Briefing identifier"],
            ["[CONTENT_CATEGORY]", "Podcast category"],
            ["[DURATION_TIER]", "Briefing duration tier (minutes)"],
          ].map(([variable, desc]) => (
            <div key={variable} className="flex items-center gap-2">
              <code className="bg-white/5 text-[#F97316] px-1.5 py-0.5 rounded text-[10px] font-mono">
                {variable}
              </code>
              <span className="text-[#9CA3AF]">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdPlacementCard({
  title,
  description,
  enabled,
  onEnabledChange,
  vastUrl,
  onVastUrlChange,
  onTest,
  isTesting,
  testResult,
  disabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  vastUrl: string;
  onVastUrlChange: (v: string) => void;
  onTest: () => void;
  isTesting: boolean;
  testResult: { valid: boolean; error?: string } | null;
  disabled: boolean;
}) {
  return (
    <div
      className={`bg-[#0F1D32] border border-white/5 rounded-lg p-4 space-y-3 transition-opacity ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-[#F9FAFB]">{title}</span>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={
              enabled
                ? "bg-[#10B981]/15 text-[#10B981] text-[10px]"
                : "bg-white/5 text-[#9CA3AF] text-[10px]"
            }
          >
            {enabled ? "ON" : "OFF"}
          </Badge>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            className="data-[state=checked]:bg-[#F97316]"
          />
        </div>
      </div>

      {/* VAST URL input */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">VAST Tag URL</label>
        <div className="flex gap-2">
          <Input
            value={vastUrl}
            onChange={(e) => onVastUrlChange(e.target.value)}
            placeholder="https://pubads.g.doubleclick.net/gampad/ads?..."
            className="flex-1 bg-white/5 border-white/10 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/40 focus:border-[#3B82F6]/50"
            disabled={!enabled}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={!enabled || !vastUrl || isTesting}
            className="border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5 text-xs gap-1.5"
          >
            <PlayCircle className="h-3 w-3" />
            {isTesting ? "Testing..." : "Test"}
          </Button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[10px] mt-1 ${testResult.valid ? "text-[#10B981]" : "text-[#EF4444]"}`}>
            {testResult.valid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {testResult.valid ? "VAST tag is valid" : testResult.error || "Invalid VAST tag"}
          </div>
        )}
      </div>
    </div>
  );
}
