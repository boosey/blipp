import { useUser, SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

/**
 * Route guard that ensures the current user is an authenticated admin.
 * Renders children only when the user has isAdmin: true.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const apiFetch = useApiFetch();

  useEffect(() => {
    if (!isLoaded || !user) return;

    // Check admin status via the API health-check style endpoint
    apiFetch<{ isAdmin: boolean }>("/admin/dashboard/health")
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [isLoaded, user, apiFetch]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A1628]">
        <div className="text-[#9CA3AF]">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <SignedIn>
        {isAdmin === null && (
          <div className="flex h-screen items-center justify-center bg-[#0A1628]">
            <div className="text-[#9CA3AF]">Verifying admin access...</div>
          </div>
        )}
        {isAdmin === false && (
          <div className="flex h-screen items-center justify-center bg-[#0A1628]">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#F9FAFB] mb-2">Access Denied</h1>
              <p className="text-[#9CA3AF]">You do not have admin privileges.</p>
            </div>
          </div>
        )}
        {isAdmin === true && children}
      </SignedIn>
      <SignedOut>
        <div className="flex justify-center items-center min-h-screen">
          <SignIn fallbackRedirectUrl="/home" />
        </div>
      </SignedOut>
    </>
  );
}
