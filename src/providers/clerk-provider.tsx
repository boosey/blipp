/// <reference types="vite/client" />
import { Capacitor } from "@capacitor/core";
import { ClerkProvider } from "@clerk/clerk-react";

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();

  // Temporarily bypass Clerk on native to test if the app renders
  if (isNative) {
    console.log("CLERK_BYPASS: skipping Clerk on native platform");
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      allowedRedirectOrigins={["capacitor://localhost", "blipp://"]}
    >
      {children}
    </ClerkProvider>
  );
}
