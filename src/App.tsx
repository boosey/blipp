import { Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { AppLayout } from "./layouts/app-layout";
import { Landing } from "./pages/landing";
import { Pricing } from "./pages/pricing";
import { Dashboard } from "./pages/dashboard";
import { Discover } from "./pages/discover";
import { Settings } from "./pages/settings";
import { Billing } from "./pages/billing";

/** Root application component with route definitions. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route
        element={
          <>
            <SignedIn>
              <AppLayout />
            </SignedIn>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
          </>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
      </Route>
    </Routes>
  );
}
