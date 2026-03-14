import { useState, useEffect } from "react";
import { useApiFetch } from "../lib/api";

export function useOnboarding() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const apiFetch = useApiFetch();

  useEffect(() => {
    const check = async () => {
      if (localStorage.getItem("blipp:onboarding-complete")) {
        setIsChecking(false);
        return;
      }

      try {
        const res = await apiFetch<{ subscriptions: { podcastId: string }[] }>(
          "/podcasts/subscriptions"
        );
        if (res.subscriptions && res.subscriptions.length > 0) {
          localStorage.setItem("blipp:onboarding-complete", "true");
        } else {
          setNeedsOnboarding(true);
        }
      } catch {
        // On error, don't block — skip onboarding
      }
      setIsChecking(false);
    };
    check();
  }, [apiFetch]);

  return { needsOnboarding, isChecking };
}
