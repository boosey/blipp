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
  const { isAdmin } = useOnboarding();
  const miniPlayerRef = useRef<MiniPlayerHandle>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const hasMiniPlayer = currentItem !== null;
  const isOnboarding = location.pathname === "/onboarding";
  const isSubPage = !TOP_LEVEL_PATHS.includes(location.pathname);

  // Legacy onboarding route — redirect to home (inline onboarding handles it now)
  if (isOnboarding) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="h-[100dvh] bg-background text-foreground flex flex-col max-w-3xl mx-auto lg:border-x lg:border-border">
      <OfflineIndicator />
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b border-border bg-background">
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
          <div className="flex items-center gap-2">
            <img src="/blipp-icon-transparent-192.png" alt="" className="h-8 w-8" />
            <img src="/blipp-wordmark-transparent.png" alt="Blipp" className="h-6 w-auto translate-y-0.5" />
          </div>
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
