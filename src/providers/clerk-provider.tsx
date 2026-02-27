/// <reference types="vite/client" />
import { ClerkProvider } from "@clerk/clerk-react";

/** Wraps children with Clerk auth context using the Vite env publishable key. */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}
