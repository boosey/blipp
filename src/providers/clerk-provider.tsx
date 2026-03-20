/// <reference types="vite/client" />
import { ClerkProvider } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  // On native, proxy Clerk API calls through our domain to avoid CORS issues
  // (capacitor://localhost origin is rejected by clerk.podblipp.com directly)
  const proxyUrl = Capacitor.isNativePlatform()
    ? "https://podblipp.com/__clerk"
    : undefined;

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      proxyUrl={proxyUrl}
    >
      {children}
    </ClerkProvider>
  );
}
