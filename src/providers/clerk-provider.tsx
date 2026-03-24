/// <reference types="vite/client" />
import { Capacitor } from "@capacitor/core";
import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

/** Strips capacitor:// URLs down to just the pathname for Clerk navigation. */
function sanitizeUrl(url: string): string {
  if (url.startsWith("capacitor://")) {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return url;
    }
  }
  return url;
}

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const navigate = useNavigate();

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      routerPush={(to) => navigate(sanitizeUrl(to))}
      routerReplace={(to) => navigate(sanitizeUrl(to), { replace: true })}
      {...(isNative && {
        proxyUrl: "https://blipp-staging.boosey-boudreaux.workers.dev/api/__clerk",
        // Don't set clerkJSUrl — let Clerk load its JS from the default CDN
        // based on the publishable key (dev vs production)
        allowedRedirectOrigins: ["capacitor://podblipp.com", "capacitor://localhost"],
        signInUrl: "/sign-in",
        signUpUrl: "/sign-up",
        afterSignOutUrl: "/",
        signInFallbackRedirectUrl: "/home",
        signUpFallbackRedirectUrl: "/home",
      })}
    >
      {children}
    </ClerkProvider>
  );
}
