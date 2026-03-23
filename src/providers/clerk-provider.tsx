/// <reference types="vite/client" />
import { Capacitor } from "@capacitor/core";
import { ClerkProvider } from "@clerk/clerk-react";

const tokenCache = {
  getToken: (key: string) => Promise.resolve(localStorage.getItem(key)),
  saveToken: (key: string, token: string) => {
    localStorage.setItem(key, token);
    return Promise.resolve();
  },
  clearToken: (key: string) => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      {...(isNative && {
        allowedRedirectOrigins: ["capacitor://localhost", "blipp://"],
        tokenCache,
      })}
    >
      {children}
    </ClerkProvider>
  );
}
