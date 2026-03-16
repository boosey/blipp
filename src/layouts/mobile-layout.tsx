import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "../components/bottom-nav";
import { AudioProvider, useAudio } from "../contexts/audio-context";
import { PlanProvider } from "../contexts/plan-context";
import { MiniPlayer } from "../components/mini-player";
import { OnboardingProvider, useOnboarding } from "../contexts/onboarding-context";
import { OfflineIndicator } from "../components/offline-indicator";
import { PodcastSheetProvider } from "../contexts/podcast-sheet-context";
import { PodcastDetailSheet } from "../components/podcast-detail-sheet";

const TOP_LEVEL_PATHS = ["/home", "/discover", "/library", "/settings"];

function MobileLayoutInner() {
  const { currentItem } = useAudio();
  const { needsOnboarding, isChecking } = useOnboarding();
  const location = useLocation();
  const navigate = useNavigate();
  const hasMiniPlayer = currentItem !== null;
  const isOnboarding = location.pathname === "/onboarding";
  const isSubPage = !TOP_LEVEL_PATHS.includes(location.pathname);

  if (!isChecking && needsOnboarding && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Onboarding page renders fullscreen — no header, nav, or player
  if (isOnboarding) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      <OfflineIndicator />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {isSubPage && (
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-lg font-bold">Blipp</span>
        </div>
        <UserButton />
      </header>

      {/* Scrollable content area */}
      <main
        className={`flex-1 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? "pb-36" : "pb-20"}`}
        style={{ viewTransitionName: "page" }}
      >
        <Outlet />
      </main>

      {/* Mini-player (above bottom nav) */}
      {hasMiniPlayer && <MiniPlayer />}

      {/* Bottom nav */}
      <BottomNav />

      {/* Podcast detail sheet */}
      <PodcastDetailSheet />
    </div>
  );
}

export function MobileLayout() {
  return (
    <AudioProvider>
      <PlanProvider>
        <OnboardingProvider>
          <PodcastSheetProvider>
            <MobileLayoutInner />
          </PodcastSheetProvider>
        </OnboardingProvider>
      </PlanProvider>
    </AudioProvider>
  );
}
