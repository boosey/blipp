import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { apiFetch } from "../lib/api-client";
import { PlanCards } from "../components/plan-cards";

export function Pricing() {
  const { user } = useUser();
  const [currentPlanSlug, setCurrentPlanSlug] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      apiFetch<{ user: { plan: { slug: string } } }>("/me")
        .then((r) => setCurrentPlanSlug(r.user.plan.slug))
        .catch(() => {});
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2">Pricing</h1>
        <p className="text-zinc-400 text-center mb-8">
          Choose the plan that fits your listening.
        </p>

        <PlanCards currentPlanSlug={currentPlanSlug} />

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
