import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { lazy, Suspense } from "react";
import { MobileLayout } from "./layouts/mobile-layout";
import { AdminLayout } from "./layouts/admin-layout";
import { AdminGuard } from "./components/admin-guard";
import { Landing } from "./pages/landing";
import { Pricing } from "./pages/pricing";
import { Home } from "./pages/home";
import { Discover } from "./pages/discover";
import { PodcastDetail } from "./pages/podcast-detail";
import { LibraryPage } from "./pages/library";
import { Settings } from "./pages/settings";
import { BriefingPlayer } from "./pages/briefing-player";

// Lazy-load admin pages for code splitting
const CommandCenter = lazy(() => import("./pages/admin/command-center"));
const Pipeline = lazy(() => import("./pages/admin/pipeline"));
const Catalog = lazy(() => import("./pages/admin/catalog"));
const Briefings = lazy(() => import("./pages/admin/briefings"));
const AdminUsers = lazy(() => import("./pages/admin/users"));
const Analytics = lazy(() => import("./pages/admin/analytics"));
const PipelineControls = lazy(() => import("./pages/admin/pipeline-controls"));
const StageModels = lazy(() => import("./pages/admin/stage-models"));
const FeatureFlags = lazy(() => import("./pages/admin/feature-flags"));
const PodcastSettings = lazy(() => import("./pages/admin/podcast-settings"));
const Requests = lazy(() => import("./pages/admin/requests"));
const Plans = lazy(() => import("./pages/admin/plans"));
const SttBenchmark = lazy(() => import("./pages/admin/stt-benchmark"));
const ModelRegistry = lazy(() => import("./pages/admin/model-registry"));
const AdminApiKeys = lazy(() => import("./pages/admin/api-keys"));
const AdminAuditLog = lazy(() => import("./pages/admin/audit-log"));
const AdminAiErrors = lazy(() => import("./pages/admin/ai-errors"));
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
    <Routes>
      <Route path="/" element={
        <>
          <SignedIn><Navigate to="/home" replace /></SignedIn>
          <SignedOut><Landing /></SignedOut>
        </>
      } />
      <Route path="/pricing" element={<Pricing />} />

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
              <RedirectToSignIn />
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
        <Route path="/play/:feedItemId" element={<BriefingPlayer />} />
        <Route path="/briefing/:requestId" element={<Navigate to="/home" replace />} />
        <Route path="/onboarding" element={<Suspense fallback={null}><Onboarding /></Suspense>} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <Suspense fallback={<AdminLoading />}>
              <AdminLayout />
            </Suspense>
          </AdminGuard>
        }
      >
        <Route index element={<Navigate to="command-center" replace />} />
        <Route path="command-center" element={<Suspense fallback={<AdminLoading />}><CommandCenter /></Suspense>} />
        <Route path="pipeline" element={<Suspense fallback={<AdminLoading />}><Pipeline /></Suspense>} />
        <Route path="catalog" element={<Suspense fallback={<AdminLoading />}><Catalog /></Suspense>} />
        <Route path="briefings" element={<Suspense fallback={<AdminLoading />}><Briefings /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<AdminLoading />}><AdminUsers /></Suspense>} />
        <Route path="plans" element={<Suspense fallback={<AdminLoading />}><Plans /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<AdminLoading />}><Analytics /></Suspense>} />
        <Route path="pipeline-controls" element={<Suspense fallback={<AdminLoading />}><PipelineControls /></Suspense>} />
        <Route path="stage-models" element={<Suspense fallback={<AdminLoading />}><StageModels /></Suspense>} />
        <Route path="feature-flags" element={<Suspense fallback={<AdminLoading />}><FeatureFlags /></Suspense>} />
        <Route path="podcast-settings" element={<Suspense fallback={<AdminLoading />}><PodcastSettings /></Suspense>} />
        <Route path="configuration" element={<Navigate to="pipeline-controls" replace />} />
        <Route path="requests" element={<Suspense fallback={<AdminLoading />}><Requests /></Suspense>} />
        <Route path="stt-benchmark" element={<Suspense fallback={<AdminLoading />}><SttBenchmark /></Suspense>} />
        <Route path="model-registry" element={<Suspense fallback={<AdminLoading />}><ModelRegistry /></Suspense>} />
        <Route path="api-keys" element={<Suspense fallback={<AdminLoading />}><AdminApiKeys /></Suspense>} />
        <Route path="audit-log" element={<Suspense fallback={<AdminLoading />}><AdminAuditLog /></Suspense>} />
        <Route path="ai-errors" element={<Suspense fallback={<AdminLoading />}><AdminAiErrors /></Suspense>} />
      </Route>
    </Routes>
  );
}
