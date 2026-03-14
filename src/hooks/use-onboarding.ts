import { useState, useEffect, useRef } from "react";
import { useApiFetch } from "../lib/api";

export function useOnboarding() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const apiFetch = useApiFetch();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const check = async () => {
      // Fast path: localStorage flag means they completed onboarding
      if (localStorage.getItem("blipp:onboarding-complete")) {
        setIsChecking(false);
        return;
      }

      // Slow path: check if they have any activity (subscriptions or favorites)
      try {
        const res = await apiFetch<{ subscriptions: { podcastId: string }[] }>(
          "/podcasts/subscriptions"
        );
        if (res.subscriptions && res.subscriptions.length > 0) {
          localStorage.setItem("blipp:onboarding-complete", "true");
          setIsChecking(false);
          return;
        }
      } catch {
        // API error — don't block, skip onboarding
        setIsChecking(false);
        return;
      }

      try {
        const res = await apiFetch<{ data: { id: string }[] }>(
          "/podcasts/favorites"
        );
        if (res.data && res.data.length > 0) {
          localStorage.setItem("blipp:onboarding-complete", "true");
          setIsChecking(false);
          return;
        }
      } catch {
        // Non-critical
      }

      setNeedsOnboarding(true);
      setIsChecking(false);
    };
    check();
  }, [apiFetch]);

  return { needsOnboarding, isChecking };
}
