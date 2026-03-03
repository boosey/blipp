import { Outlet, NavLink, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import {
  LayoutDashboard,
  GitBranch,
  Library,
  Disc3,
  Radio,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { path: "command-center", label: "Command Center", icon: LayoutDashboard, shortcut: "H" },
  { path: "pipeline", label: "Pipeline", icon: GitBranch, shortcut: "P" },
  { path: "requests", label: "Requests", icon: ClipboardList, shortcut: "R" },
  { path: "catalog", label: "Catalog", icon: Library, shortcut: "C" },
  { path: "episodes", label: "Episodes", icon: Disc3, shortcut: "E" },
  { path: "briefings", label: "Briefings", icon: Radio, shortcut: "B" },
  { path: "users", label: "Users", icon: Users, shortcut: "U" },
  { path: "analytics", label: "Analytics", icon: BarChart3, shortcut: "A" },
  { path: "configuration", label: "Configuration", icon: Settings, shortcut: "," },
];

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const currentPage = navItems.find((item) =>
    location.pathname.includes(item.path)
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen bg-[#0A1628] text-[#F9FAFB] overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r border-white/5 bg-[#0F1D32] transition-all duration-200",
            collapsed ? "w-16" : "w-60"
          )}
        >
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 px-4 border-b border-white/5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B82F6] font-bold text-sm shrink-0">
              B
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Blipp Admin</span>
                <span className="text-[10px] text-[#9CA3AF]">Mission Control</span>
              </div>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 flex flex-col gap-0.5 py-3 px-2 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.includes(item.path);
              const linkClasses = cn(
                "flex items-center w-full rounded-md py-2 text-sm transition-colors",
                collapsed ? "justify-center" : "gap-3 px-3",
                isActive
                  ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                  : "text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB]"
              );
              const link = (
                <NavLink
                  key={item.path}
                  to={`/admin/${item.path}`}
                  className={linkClasses}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && (
                    <kbd className="ml-auto text-[10px] text-[#9CA3AF]/50 font-mono shrink-0">
                      {item.shortcut}
                    </kbd>
                  )}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="bg-[#1A2942] text-[#F9FAFB] border-white/10">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>

          {/* Collapse button */}
          <div className="p-2 border-t border-white/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              className="w-full justify-center text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#0F1D32] px-6">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">
                {currentPage?.label ?? "Admin"}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#9CA3AF]" />
                <Input
                  placeholder="Search... (⌘K)"
                  className="w-64 bg-white/5 border-white/10 pl-9 text-sm text-[#F9FAFB] placeholder:text-[#9CA3AF]/60 focus:border-[#3B82F6]/50 focus:ring-[#3B82F6]/20"
                />
              </div>

              <Separator orientation="vertical" className="h-6 bg-white/10" />

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="text-[#9CA3AF] hover:text-[#F9FAFB] relative">
                <Bell className="h-4 w-4" />
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-[#EF4444] hover:bg-[#EF4444]">
                  3
                </Badge>
              </Button>

              {/* User */}
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
