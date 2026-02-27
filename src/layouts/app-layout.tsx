import { Link, Outlet, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";

/** Navigation link item definition. */
interface NavItem {
  to: string;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Briefings" },
  { to: "/discover", label: "Discover" },
  { to: "/settings", label: "Settings" },
];

/** Authenticated app shell with navigation bar and nested route outlet. */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <nav className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-xl font-bold">
            Blipp
          </Link>
          <div className="flex gap-4">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  location.pathname === item.to
                    ? "bg-zinc-800 text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <UserButton />
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
