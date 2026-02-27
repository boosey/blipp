import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Post-checkout landing page shown after Stripe redirect. */
export function Billing() {
  const [params] = useSearchParams();
  const success = params.get("success") === "true";
  const canceled = params.get("canceled") === "true";

  useEffect(() => {
    if (success) {
      // Tier update happens async via Stripe webhook — give it a moment
      const timeout = setTimeout(() => window.location.reload(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [success]);

  return (
    <div className="max-w-md mx-auto text-center py-20">
      {success && (
        <>
          <h1 className="text-2xl font-bold mb-2">You're upgraded!</h1>
          <p className="text-zinc-400 mb-6">
            Your subscription is active. Refreshing your account...
          </p>
        </>
      )}

      {canceled && (
        <>
          <h1 className="text-2xl font-bold mb-2">Checkout canceled</h1>
          <p className="text-zinc-400 mb-6">
            No worries — you can upgrade any time.
          </p>
        </>
      )}

      {!success && !canceled && (
        <>
          <h1 className="text-2xl font-bold mb-2">Billing</h1>
          <p className="text-zinc-400 mb-6">
            Manage your subscription from Settings.
          </p>
        </>
      )}

      <Link
        to="/dashboard"
        className="px-6 py-2.5 bg-zinc-50 text-zinc-950 font-medium rounded-lg hover:bg-zinc-200 transition-colors inline-block"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
