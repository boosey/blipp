import { Headphones } from "lucide-react";
import { Link } from "react-router-dom";

export function SubscribeNudge() {
  const dismissed = sessionStorage.getItem("subscribe-nudge-dismissed");
  if (dismissed) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-5 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Headphones className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-base">Find podcasts you love</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Subscribe to podcasts in Discover to start getting daily briefings.
          </p>
          <Link
            to="/discover"
            className="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform"
          >
            Explore Podcasts →
          </Link>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem("subscribe-nudge-dismissed", "1");
            // Force re-render via parent — nudge checks sessionStorage on render
            window.dispatchEvent(new Event("storage"));
          }}
          className="text-xs text-muted-foreground/60 hover:text-foreground"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
