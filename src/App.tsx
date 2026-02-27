import { Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/react";
import { AppLayout } from "./layouts/app-layout";
import { Landing } from "./pages/landing";
import { Dashboard } from "./pages/dashboard";
import { Discover } from "./pages/discover";
import { Settings } from "./pages/settings";

/** Root application component with route definitions. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
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
      </Route>
    </Routes>
  );
}
