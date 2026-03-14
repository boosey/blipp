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
      try {
        const res = await apiFetch<{
          user: { onboardingComplete?: boolean };
        }>("/me");

        if (res.user.onboardingComplete) {
          setIsChecking(false);
          return;
        }

        setNeedsOnboarding(true);
      } catch {
        // API error — don't block, skip onboarding
      }
      setIsChecking(false);
    };
    check();
  }, [apiFetch]);

  return { needsOnboarding, isChecking };
}
