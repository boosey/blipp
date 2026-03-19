import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  }

  function handleDecline() {
    localStorage.setItem("cookie-consent", "declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-20 animate-slide-up"
    >
      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <p className="text-sm text-muted-foreground flex-1">
          We use cookies to improve your experience.{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Learn more
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
