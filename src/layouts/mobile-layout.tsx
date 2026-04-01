import { useRef, useCallback, useState } from "react";
import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { ArrowLeft, Shield, MessageSquare } from "lucide-react";
import { FeedbackDialog } from "../components/feedback-dialog";
import { BottomNav } from "../components/bottom-nav";
import { AudioProvider, useAudio } from "../contexts/audio-context";
import { PlanProvider } from "../contexts/plan-context";
import { MiniPlayer, type MiniPlayerHandle } from "../components/mini-player";
import { OnboardingProvider, useOnboarding } from "../contexts/onboarding-context";
import { OfflineIndicator } from "../components/offline-indicator";
import { PodcastSheetProvider } from "../contexts/podcast-sheet-context";
import { PodcastDetailSheet } from "../components/podcast-detail-sheet";

const TOP_LEVEL_PATHS = ["/home", "/discover", "/library", "/settings"];

function MobileLayoutInner() {
  const { currentItem } = useAudio();
  const { needsOnboarding, isChecking, isAdmin } = useOnboarding();
  const miniPlayerRef = useRef<MiniPlayerHandle>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const hasMiniPlayer = currentItem !== null;
  const isOnboarding = location.pathname === "/onboarding";
  const isSharedPlay = location.pathname.startsWith("/play/");
  const isSubPage = !TOP_LEVEL_PATHS.includes(location.pathname);

  // Skip onboarding for shared play links — let them hear the briefing first
  if (!isChecking && needsOnboarding && !isOnboarding && !isSharedPlay) {
    return <Navigate to="/onboarding" replace />;
  }

  // Onboarding page renders fullscreen — no header, nav, or player
  if (isOnboarding) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-3xl mx-auto lg:border-x lg:border-border">
      <OfflineIndicator />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {isSubPage && (
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-lg font-bold flex items-center">
            <span className="w-10 h-10 overflow-hidden rounded-md -mr-3 flex-shrink-0">
              <img src="/blipp_icon_clean_128.png" alt="" className="w-[140%] h-[140%] object-cover -ml-[20%] -mt-[20%]" />
            </span>
            <span className="bg-gradient-to-r from-pink-300 via-purple-400 to-indigo-400 bg-clip-text text-transparent">lipp</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFeedbackOpen(true)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Send feedback"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          {isAdmin && (
            <button
              onClick={() => window.open("/admin", "blipp-admin")}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Admin"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <UserButton />
        </div>
      </header>

      {/* Scrollable content area */}
      <main
        className={`flex-1 min-w-0 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? "pb-36" : "pb-20"}`}
        style={{ viewTransitionName: "page" }}
      >
        <Outlet />
      </main>

      {/* Mini-player (above bottom nav) */}
      {hasMiniPlayer && <MiniPlayer ref={miniPlayerRef} />}

      {/* Bottom nav */}
      <BottomNav onTabClick={() => miniPlayerRef.current?.closeSheet()} />

      {/* Podcast detail sheet */}
      <PodcastDetailSheet />

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
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
