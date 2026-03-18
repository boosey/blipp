import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-muted text-muted-foreground text-xs px-4 py-2 flex items-center gap-2">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>You're offline. Previously played briefings are still available.</span>
    </div>
  );
}
