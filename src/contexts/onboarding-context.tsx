import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useApiFetch } from "../lib/api";
import { trackSignUpConversion } from "../lib/gtag";

interface OnboardingContextValue {
  needsOnboarding: boolean;
  isChecking: boolean;
  isAdmin: boolean;
  markComplete: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  needsOnboarding: false,
  isChecking: true,
  isAdmin: false,
  markComplete: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const apiFetch = useApiFetch();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const check = async () => {
      try {
        const res = await apiFetch<{
          user: { onboardingComplete?: boolean; isAdmin?: boolean };
        }>("/me");

        if (res.user.isAdmin) {
          setIsAdmin(true);
        }

        if (res.user.onboardingComplete) {
          setIsChecking(false);
          return;
        }

        setNeedsOnboarding(true);
        trackSignUpConversion();
      } catch {
        // API error — don't block, skip onboarding
      }
      setIsChecking(false);
    };
    check();
  }, [apiFetch]);

  const markComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  return (
    <OnboardingContext.Provider value={{ needsOnboarding, isChecking, isAdmin, markComplete }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
