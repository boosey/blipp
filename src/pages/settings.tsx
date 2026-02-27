import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

/** Tier-based maximum briefing lengths in minutes. */
const TIER_MAX_LENGTH: Record<string, number> = {
  FREE: 5,
  PRO: 30,
  PRO_PLUS: 30,
};

/** Settings page for briefing preferences and subscription management. */
export function Settings() {
  const apiFetch = useApiFetch();
  const [tier, setTier] = useState("FREE");
  const maxLength = TIER_MAX_LENGTH[tier] ?? 5;

  const [briefingLength, setBriefingLength] = useState(5);
  const [briefingTime, setBriefingTime] = useState("07:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ briefingLength: number; briefingTime: string; tier: string }>(
      "/briefings/preferences"
    )
      .then((prefs) => {
        setBriefingLength(prefs.briefingLength);
        setBriefingTime(prefs.briefingTime);
        setTier(prefs.tier);
      })
      .catch(() => {
        // Use defaults if no preferences exist
      });
  }, [apiFetch]);

  /** Saves briefing preferences via API. */
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/briefings/preferences", {
        method: "PATCH",
        body: JSON.stringify({ briefingLength, briefingTime }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  /** Redirects to Stripe Checkout for the given tier. */
  async function handleUpgrade(upgradeTier: string) {
    setActionLoading(upgradeTier);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: upgradeTier }),
      });
      window.location.href = url;
    } catch {
      setActionLoading(null);
    }
  }

  /** Redirects to Stripe Customer Portal. */
  async function handleManage() {
    setActionLoading("manage");
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/portal", {
        method: "POST",
      });
      window.location.href = url;
    } catch {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Briefing Preferences</h2>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            Briefing Length: {briefingLength} min
          </label>
          <input
            type="range"
            min={1}
            max={maxLength}
            value={briefingLength}
            onChange={(e) => setBriefingLength(Number(e.target.value))}
            className="w-full"
            aria-label="Briefing length"
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>1 min</span>
            <span>{maxLength} min</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">
            Briefing Time
          </label>
          <input
            type="time"
            value={briefingTime}
            onChange={(e) => setBriefingTime(e.target.value)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-50 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-zinc-50 text-zinc-950 font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
        {saved && (
          <p className="text-green-400 text-sm">Preferences saved.</p>
        )}
      </div>

      <div className="space-y-4 border-t border-zinc-800 pt-6">
        <h2 className="text-lg font-semibold">Subscription Plan</h2>
        <p className="text-zinc-400">
          Current plan: <span className="font-medium text-zinc-50">{tier}</span>
        </p>

        {tier === "FREE" && (
          <div className="space-y-2">
            <button
              onClick={() => handleUpgrade("PRO")}
              disabled={actionLoading === "PRO"}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-left hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <span className="font-medium">
                {actionLoading === "PRO" ? "Redirecting..." : "Upgrade to Pro"}
              </span>
              <span className="text-zinc-400 ml-2">$9.99/mo</span>
            </button>
            <button
              onClick={() => handleUpgrade("PRO_PLUS")}
              disabled={actionLoading === "PRO_PLUS"}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-left hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <span className="font-medium">
                {actionLoading === "PRO_PLUS"
                  ? "Redirecting..."
                  : "Upgrade to Pro+"}
              </span>
              <span className="text-zinc-400 ml-2">$19.99/mo</span>
            </button>
            <Link
              to="/pricing"
              className="block text-sm text-zinc-500 hover:text-zinc-300 mt-1"
            >
              Compare plans &rarr;
            </Link>
          </div>
        )}

        {(tier === "PRO" || tier === "PRO_PLUS") && (
          <button
            onClick={handleManage}
            disabled={actionLoading === "manage"}
            className="px-6 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {actionLoading === "manage"
              ? "Redirecting..."
              : "Manage Subscription"}
          </button>
        )}
      </div>
    </div>
  );
}
