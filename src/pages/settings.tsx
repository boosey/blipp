import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiFetch } from "../lib/api";
import { Skeleton } from "../components/ui/skeleton";

interface PlanInfo {
  id: string;
  name: string;
  slug: string;
}

interface UpgradePlan {
  id: string;
  slug: string;
  name: string;
  priceCentsMonthly: number;
}

/** Settings page for subscription management. */
export function Settings() {
  const apiFetch = useApiFetch();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [upgradePlans, setUpgradePlans] = useState<UpgradePlan[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ user: { plan: PlanInfo } }>("/me")
      .then((r) => setPlan(r.user.plan))
      .catch(() => toast.error("Failed to load account info"));
  }, [apiFetch]);

  useEffect(() => {
    if (plan?.slug === "free") {
      apiFetch<UpgradePlan[]>("/plans")
        .then((plans) => setUpgradePlans(plans.filter((p) => p.priceCentsMonthly > 0)))
        .catch(() => toast.error("Failed to load plans"));
    }
  }, [apiFetch, plan?.slug]);

  /** Redirects to Stripe Checkout for the given plan. */
  async function handleUpgrade(upgradePlan: UpgradePlan) {
    setActionLoading(upgradePlan.id);
    try {
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: upgradePlan.id, interval: "monthly" }),
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open billing portal");
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Subscription Plan</h2>
        <p className="text-zinc-400">
          Current plan:{" "}
          <span className="font-medium text-zinc-50">
            {plan ? plan.name : <Skeleton className="h-5 w-24 inline-block" />}
          </span>
        </p>

        {plan?.slug === "free" && (
          <div className="space-y-2">
            {upgradePlans.map((up) => (
              <button
                key={up.id}
                onClick={() => handleUpgrade(up)}
                disabled={actionLoading === up.id}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-left hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <span className="font-medium">
                  {actionLoading === up.id
                    ? "Redirecting..."
                    : `Upgrade to ${up.name}`}
                </span>
                <span className="text-zinc-400 ml-2">
                  ${(up.priceCentsMonthly / 100).toFixed(2)}/mo
                </span>
              </button>
            ))}
            <Link
              to="/pricing"
              className="block text-sm text-zinc-500 hover:text-zinc-300 mt-1"
            >
              Compare plans &rarr;
            </Link>
          </div>
        )}

        {plan && plan.slug !== "free" && (
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
