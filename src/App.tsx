import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, SignIn, AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";

function SSOCallback() {
  return <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/home" signUpFallbackRedirectUrl="/home" />;
}
import { lazy, Suspense } from "react";
import { MobileLayout } from "./layouts/mobile-layout";
const AdminLayout = lazy(() => import("./layouts/admin-layout").then(m => ({ default: m.AdminLayout })));
const AdminGuard = lazy(() => import("./components/admin-guard").then(m => ({ default: m.AdminGuard })));
import { NativeSignIn } from "./components/native-sign-in";
import { Landing } from "./pages/landing";
import { Pricing } from "./pages/pricing";
import { About } from "./pages/about";
import { Contact } from "./pages/contact";
import { CookieConsent } from "./components/cookie-consent";
import { NotFound } from "./pages/not-found";
import { Home } from "./pages/Home";
import { Discover } from "./pages/discover";
import { PodcastDetail } from "./pages/podcast-detail";
import { LibraryPage } from "./pages/library";
import { Settings } from "./pages/Settings";
import { BriefingPlayer } from "./pages/briefing-player";

// Lazy-load admin pages for code splitting
const CommandCenter = lazy(() => import("./pages/admin/command-center"));
const Pipeline = lazy(() => import("./pages/admin/pipeline"));
const Catalog = lazy(() => import("./pages/admin/catalog"));
const Briefings = lazy(() => import("./pages/admin/briefings"));
const AdminUsers = lazy(() => import("./pages/admin/users"));
const Analytics = lazy(() => import("./pages/admin/analytics"));
const StageConfiguration = lazy(() => import("./pages/admin/stage-configuration"));
const FeatureFlags = lazy(() => import("./pages/admin/feature-flags"));
const PodcastSettings = lazy(() => import("./pages/admin/podcast-settings"));
const Requests = lazy(() => import("./pages/admin/requests"));
const Plans = lazy(() => import("./pages/admin/plans"));
const SttBenchmark = lazy(() => import("./pages/admin/stt-benchmark"));
const ClaimsBenchmark = lazy(() => import("./pages/admin/claims-benchmark"));
const ModelRegistry = lazy(() => import("./pages/admin/model-registry"));
const AdminApiKeys = lazy(() => import("./pages/admin/api-keys"));
const AdminAuditLog = lazy(() => import("./pages/admin/audit-log"));
const AdminAiErrors = lazy(() => import("./pages/admin/ai-errors"));
const AdminWorkerLogs = lazy(() => import("./pages/admin/worker-logs"));
const AdminAds = lazy(() => import("./pages/admin/ads"));
const AdminRecommendations = lazy(() => import("./pages/admin/recommendations"));
const CatalogDiscovery = lazy(() => import("./pages/admin/catalog-discovery"));
const PodcastSources = lazy(() => import("./pages/admin/podcast-sources"));
const ScheduledJobs = lazy(() => import("./pages/admin/scheduled-jobs"));
const SystemSettings = lazy(() => import("./pages/admin/system-settings"));
const DlqMonitor = lazy(() => import("./pages/admin/dlq"));
const VoicePresets = lazy(() => import("./pages/admin/voice-presets"));
const EpisodeRefresh = lazy(() => import("./pages/admin/episode-refresh"));
const AdminFeedback = lazy(() => import("./pages/admin/feedback"));
const AdminBlippFeedback = lazy(() => import("./pages/admin/blipp-feedback"));
const AdminDigests = lazy(() => import("./pages/admin/digests"));
const TermsOfService = lazy(() => import("./pages/tos"));
const PrivacyPolicy = lazy(() => import("./pages/privacy"));
const Onboarding = lazy(() => import("./pages/onboarding"));
const History = lazy(() => import("./pages/history"));

function AdminLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-[#9CA3AF] text-sm">Loading...</div>
    </div>
  );
}

/** Root application component with route definitions. */
export default function App() {
  return (
    <>
    <SignedOut><CookieConsent /></SignedOut>
    <Routes>
      <Route path="/" element={
        <>
          <SignedIn><Navigate to="/home" replace /></SignedIn>
          <SignedOut><Landing /></SignedOut>
        </>
      } />
      <Route path="/sso-callback" element={<SSOCallback />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/tos" element={<Suspense fallback={null}><TermsOfService /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPolicy /></Suspense>} />

      {/* Backwards compat */}
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="/billing" element={<Navigate to="/settings" replace />} />

      {/* User routes — mobile layout */}
      <Route
        element={
          <>
            <SignedIn>
              <MobileLayout />
            </SignedIn>
            <SignedOut>
              {Capacitor.isNativePlatform() ? (
                <NativeSignIn />
              ) : (
                <div className="flex justify-center items-center min-h-screen">
                  <SignIn fallbackRedirectUrl="/home" />
                </div>
              )}
            </SignedOut>
          </>
        }
      >
        <Route path="/home" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/discover/:podcastId" element={<PodcastDetail />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/history" element={<Suspense fallback={null}><History /></Suspense>} />
        <Route path="/play/:id" element={<BriefingPlayer />} />
        <Route path="/briefing/:requestId" element={<Navigate to="/home" replace />} />
        <Route path="/onboarding" element={<Suspense fallback={null}><Onboarding /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<AdminLoading />}>
            <AdminGuard>
              <AdminLayout />
            </AdminGuard>
          </Suspense>
        }
      >
        <Route index element={<Navigate to="command-center" replace />} />
        <Route path="command-center" element={<Suspense fallback={<AdminLoading />}><CommandCenter /></Suspense>} />
        <Route path="pipeline" element={<Suspense fallback={<AdminLoading />}><Pipeline /></Suspense>} />
        <Route path="catalog" element={<Suspense fallback={<AdminLoading />}><Catalog /></Suspense>} />
        <Route path="catalog-discovery" element={<Suspense fallback={<AdminLoading />}><CatalogDiscovery /></Suspense>} />
        <Route path="catalog-seed" element={<Navigate to="/admin/catalog-discovery" replace />} />
        <Route path="podcast-sources" element={<Suspense fallback={<AdminLoading />}><PodcastSources /></Suspense>} />
        <Route path="briefings" element={<Suspense fallback={<AdminLoading />}><Briefings /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<AdminLoading />}><AdminUsers /></Suspense>} />
        <Route path="plans" element={<Suspense fallback={<AdminLoading />}><Plans /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<AdminLoading />}><Analytics /></Suspense>} />
        <Route path="stage-configuration" element={<Suspense fallback={<AdminLoading />}><StageConfiguration /></Suspense>} />
        <Route path="stage-models" element={<Navigate to="/admin/stage-configuration" replace />} />
        <Route path="feature-flags" element={<Suspense fallback={<AdminLoading />}><FeatureFlags /></Suspense>} />
        <Route path="podcast-settings" element={<Suspense fallback={<AdminLoading />}><PodcastSettings /></Suspense>} />
        <Route path="system-settings" element={<Suspense fallback={<AdminLoading />}><SystemSettings /></Suspense>} />
        <Route path="requests" element={<Suspense fallback={<AdminLoading />}><Requests /></Suspense>} />
        <Route path="stt-benchmark" element={<Suspense fallback={<AdminLoading />}><SttBenchmark /></Suspense>} />
        <Route path="claims-benchmark" element={<Suspense fallback={<AdminLoading />}><ClaimsBenchmark /></Suspense>} />
        <Route path="model-registry" element={<Suspense fallback={<AdminLoading />}><ModelRegistry /></Suspense>} />
        <Route path="api-keys" element={<Suspense fallback={<AdminLoading />}><AdminApiKeys /></Suspense>} />
        <Route path="audit-log" element={<Suspense fallback={<AdminLoading />}><AdminAuditLog /></Suspense>} />
        <Route path="ai-errors" element={<Suspense fallback={<AdminLoading />}><AdminAiErrors /></Suspense>} />
        <Route path="worker-logs" element={<Suspense fallback={<AdminLoading />}><AdminWorkerLogs /></Suspense>} />
        <Route path="ads" element={<Suspense fallback={<AdminLoading />}><AdminAds /></Suspense>} />
        <Route path="feedback" element={<Suspense fallback={<AdminLoading />}><AdminFeedback /></Suspense>} />
        <Route path="blipp-feedback" element={<Suspense fallback={<AdminLoading />}><AdminBlippFeedback /></Suspense>} />
        <Route path="recommendations" element={<Suspense fallback={<AdminLoading />}><AdminRecommendations /></Suspense>} />
        <Route path="scheduled-jobs" element={<Suspense fallback={<AdminLoading />}><ScheduledJobs /></Suspense>} />
        <Route path="prompt-management" element={<Navigate to="/admin/stage-configuration" replace />} />
        <Route path="digests" element={<Suspense fallback={<AdminLoading />}><AdminDigests /></Suspense>} />
        <Route path="dlq" element={<Suspense fallback={<AdminLoading />}><DlqMonitor /></Suspense>} />
        <Route path="voice-presets" element={<Suspense fallback={<AdminLoading />}><VoicePresets /></Suspense>} />
        <Route path="episode-refresh" element={<Suspense fallback={<AdminLoading />}><EpisodeRefresh /></Suspense>} />
      </Route>

      {/* Catch-all 404 for unauthenticated users */}
      <Route path="*" element={
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
          <header className="w-full flex items-center px-4 py-3 border-b border-border max-w-3xl">
            <span className="text-lg font-bold flex items-center">
              <span className="w-10 h-10 overflow-hidden rounded-md -mr-3 flex-shrink-0">
                <img src="/blipp_icon_clean_128.png" alt="" className="w-[140%] h-[140%] object-cover -ml-[20%] -mt-[20%]" />
              </span>
              <span className="bg-gradient-to-r from-pink-300 via-purple-400 to-indigo-400 bg-clip-text text-transparent">lipp</span>
            </span>
          </header>
          <NotFound />
        </div>
      } />
    </Routes>
    </>
  );
}
