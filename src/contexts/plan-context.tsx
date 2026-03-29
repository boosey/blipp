import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useApiFetch } from "../lib/api";

interface PlanUsage {
  plan: { name: string; slug: string };
  briefings: { used: number; limit: number | null; remaining: number | null };
  subscriptions: { used: number; limit: number | null; remaining: number | null };
  maxDurationMinutes: number;
  pastEpisodesLimit: number | null;
  publicSharing: boolean;
  transcriptAccess: boolean;

  loading: boolean;
  refetch: () => void;
}

const PlanContext = createContext<PlanUsage | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<PlanUsage>({
    plan: { name: "", slug: "" },
    briefings: { used: 0, limit: null, remaining: null },
    subscriptions: { used: 0, limit: null, remaining: null },
    maxDurationMinutes: 30,
    pastEpisodesLimit: null,
    publicSharing: false,
    transcriptAccess: false,

    loading: true,
    refetch: () => {},
  });

  const fetch = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: any }>("/me/usage");
      setData((prev) => ({
        ...prev,
        plan: res.data.plan,
        briefings: res.data.briefings,
        subscriptions: res.data.subscriptions,
        maxDurationMinutes: res.data.maxDurationMinutes,
        pastEpisodesLimit: res.data.pastEpisodesLimit ?? null,
        publicSharing: res.data.publicSharing ?? false,
        transcriptAccess: res.data.transcriptAccess ?? false,

        loading: false,
      }));
    } catch {
      setData((prev) => ({ ...prev, loading: false }));
    }
  }, [apiFetch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const value: PlanUsage = {
    ...data,
    refetch: fetch,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanUsage {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside PlanProvider");
  return ctx;
}

/** Check if user can subscribe to another podcast. Returns error message or null. */
export function useCanSubscribe(): { allowed: boolean; message: string | null } {
  const { subscriptions } = usePlan();
  if (subscriptions.limit === null) return { allowed: true, message: null };
  if (subscriptions.remaining !== null && subscriptions.remaining > 0) {
    return { allowed: true, message: null };
  }
  return {
    allowed: false,
    message: `Your ${subscriptions.limit === 0 ? "free" : "current"} plan allows ${subscriptions.limit} subscription${subscriptions.limit !== 1 ? "s" : ""}. Upgrade to add more.`,
  };
}

/** Check if a duration tier is allowed. Returns error message or null. */
export function useCanUseTier(tier: number): { allowed: boolean; message: string | null } {
  const { maxDurationMinutes } = usePlan();
  if (tier <= maxDurationMinutes) return { allowed: true, message: null };
  return {
    allowed: false,
    message: `Your plan supports briefings up to ${maxDurationMinutes} minutes. Upgrade for ${tier}-minute briefings.`,
  };
}
