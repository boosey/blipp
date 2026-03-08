import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

/** Settings page for subscription management. */
export function Settings() {
  const apiFetch = useApiFetch();
  const [tier, setTier] = useState("FREE");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ tier: string }>("/plans/current")
      .then((data) => setTier(data.tier))
      .catch(() => {});
  }, [apiFetch]);

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
