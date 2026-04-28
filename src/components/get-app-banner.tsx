import { useState, useEffect } from "react";
import { Smartphone, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { AppStoreBadge } from "./app-store-badge";
import { isIosSafari } from "../lib/platform";

const DISMISSED_KEY = "blipp-iphone-app-promo-dismissed";

export function GetAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (isIosSafari()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  if (!show) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-foreground/10 rounded-lg flex items-center justify-center flex-shrink-0">
        <Smartphone className="w-5 h-5 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Get it on iPhone</p>
        <p className="text-xs text-muted-foreground">Faster, offline, push notifications</p>
      </div>
      <AppStoreBadge height={40} className="flex-shrink-0" />
      <button
        onClick={dismiss}
        className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
