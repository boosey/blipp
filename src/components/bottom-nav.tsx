import { useLocation } from "react-router-dom";
import { Home, Search, Library, Settings } from "lucide-react";
import { useViewTransitionNavigate } from "../hooks/use-view-transition";
import { usePodcastSheet } from "../contexts/podcast-sheet-context";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav({ onTabClick }: { onTabClick?: () => void } = {}) {
  const { pathname } = useLocation();
  const navigateWithTransition = useViewTransitionNavigate();
  const { close: closePodcastSheet } = usePodcastSheet();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] bg-background border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around max-w-3xl mx-auto">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <button
              key={to}
              onClick={() => {
                closePodcastSheet();
                onTabClick?.();
                if (pathname !== to) navigateWithTransition(to);
              }}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-xs transition-colors active:scale-[0.98] transition-transform duration-75 ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
