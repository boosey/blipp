import { Link, useLocation } from "react-router-dom";
import { Home, Search, Library, Settings } from "lucide-react";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-xs transition-colors ${
                active ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
