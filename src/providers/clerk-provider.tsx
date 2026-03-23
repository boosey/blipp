/// <reference types="vite/client" />
import { Capacitor } from "@capacitor/core";
import { ClerkProvider } from "@clerk/clerk-react";

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      {...(isNative && {
        proxyUrl: "https://podblipp.com/__clerk",
        allowedRedirectOrigins: ["capacitor://podblipp.com", "capacitor://localhost"],
      })}
    >
      {children}
    </ClerkProvider>
  );
}
