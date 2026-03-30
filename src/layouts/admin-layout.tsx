import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import {
  LayoutDashboard,
  GitBranch,
  Library,
  Radio,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Boxes,
  Key,
  ScrollText,
  AlertTriangle,
  Brain,
  Sparkles,
  Flag,
  Megaphone,
  Clock,
  Scale,
  MessageSquare,
  Inbox,
  Sprout,
  RefreshCw,
  Mic,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
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

// ---------------------------------------------------------------------------
// Sidebar data
// ---------------------------------------------------------------------------

type SidebarEntry =
  | { type: "item"; path: string; label: string; icon: React.ElementType }
  | {
      type: "group";
      id: string;
      label: string;
      icon: React.ElementType;
      children: { path: string; label: string; icon: React.ElementType }[];
    };

const sidebarEntries: SidebarEntry[] = [
  { type: "item", path: "command-center", label: "Command Center", icon: LayoutDashboard },

  {
    type: "group",
    id: "podcasts",
    label: "Podcasts",
    icon: Library,
    children: [
      { path: "catalog", label: "Catalog", icon: Library },
      { path: "podcast-sources", label: "Sources", icon: Boxes },
      { path: "catalog-discovery", label: "Discovery", icon: Sprout },
      { path: "episode-refresh", label: "Fetch New Episodes", icon: RefreshCw },
      { path: "podcast-settings", label: "Settings", icon: Settings },
    ],
  },

  {
    type: "group",
    id: "pipeline",
    label: "Pipeline",
    icon: GitBranch,
    children: [
      { path: "pipeline", label: "Monitor", icon: GitBranch },
      { path: "requests", label: "Requests", icon: ClipboardList },
      { path: "briefings", label: "Briefings", icon: Radio },
      { path: "dlq", label: "Dead Letters", icon: Inbox },
    ],
  },

  {
    type: "group",
    id: "ai",
    label: "AI",
    icon: Brain,
    children: [
      { path: "model-registry", label: "Model Registry", icon: Boxes },
      { path: "stage-configuration", label: "Stage Configuration", icon: Sparkles },
      { path: "stt-benchmark", label: "STT Benchmark", icon: FlaskConical },
      { path: "claims-benchmark", label: "Claims Benchmark", icon: Scale },
      { path: "ai-errors", label: "Errors", icon: AlertTriangle },
      { path: "voice-presets", label: "Voice Presets", icon: Mic },
    ],
  },

  {
    type: "group",
    id: "users",
    label: "Users",
    icon: Users,
    children: [
      { path: "users", label: "Management", icon: Users },
      { path: "plans", label: "Plans", icon: CreditCard },
      { path: "recommendations", label: "Recommendations", icon: Sparkles },
      { path: "ads", label: "Advertisements", icon: Megaphone },
      { path: "feedback", label: "Feedback", icon: MessageSquare },
    ],
  },

  {
    type: "group",
    id: "system",
    label: "System",
    icon: Settings,
    children: [
      { path: "analytics", label: "Analytics", icon: BarChart3 },
      { path: "feature-flags", label: "Feature Flags", icon: Flag },
      { path: "api-keys", label: "API Keys", icon: Key },
      { path: "audit-log", label: "Audit Log", icon: ScrollText },
      { path: "worker-logs", label: "Worker Logs", icon: ScrollText },
      { path: "scheduled-jobs", label: "Scheduled Jobs", icon: Clock },
      { path: "system-settings", label: "System", icon: Settings2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "admin-sidebar-groups";

function loadOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set<string>();
}

function saveOpenGroups(groups: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]));
}

/** Find the group that owns the current path (if any). */
function groupForPath(pathname: string): string | null {
  for (const entry of sidebarEntries) {
    if (entry.type === "group") {
      for (const child of entry.children) {
        if (pathname.endsWith("/" + child.path)) return entry.id;
      }
    }
  }
  return null;
}

/** Resolve the current page label for the top bar. */
function resolveCurrentPage(pathname: string): string {
  // Check standalone items first
  for (const entry of sidebarEntries) {
    if (entry.type === "item" && pathname.endsWith("/" + entry.path)) {
      return entry.label;
    }
  }
  // Check group children
  for (const entry of sidebarEntries) {
    if (entry.type === "group") {
      for (const child of entry.children) {
        if (pathname.endsWith("/" + child.path)) return child.label;
      }
    }
  }
  return "Admin";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SidebarGroup({
  entry,
  collapsed,
  isOpen,
  onToggle,
}: {
  entry: Extract<SidebarEntry, { type: "group" }>;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const Icon = entry.icon;

  // -- Collapsed mode: icon only, click navigates to first child -----------
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate(`/admin/${entry.children[0].path}`)}
            className={cn(
              "flex items-center justify-center w-full rounded-md py-2 text-sm transition-colors",
              entry.children.some((ch) => location.pathname.endsWith("/" + ch.path))
                ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                : "text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[#1A2942] text-[#F9FAFB] border-white/10">
          {entry.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  // -- Expanded mode: clickable header + animated children -----------------
  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className="flex items-center w-full gap-3 rounded-md py-2 px-3 text-sm text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB] transition-colors"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{entry.label}</span>
        <ChevronRight
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </button>

      {/* Animated children container */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {entry.children.map((child) => {
            const ChildIcon = child.icon;
            const isActive = location.pathname.endsWith("/" + child.path);
            return (
              <NavLink
                key={child.path}
                to={`/admin/${child.path}`}
                className={cn(
                  "flex items-center gap-3 rounded-md py-1.5 pl-10 pr-3 text-sm transition-colors",
                  isActive
                    ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                    : "text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB]"
                )}
              >
                <ChildIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{child.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Open groups state — seeded from localStorage, auto-expands active group
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const stored = loadOpenGroups();
    const active = groupForPath(location.pathname);
    if (active) stored.add(active);
    return stored;
  });

  // Auto-expand group on route change
  useEffect(() => {
    const active = groupForPath(location.pathname);
    if (active && !openGroups.has(active)) {
      setOpenGroups((prev) => {
        const next = new Set(prev);
        next.add(active);
        saveOpenGroups(next);
        return next;
      });
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveOpenGroups(next);
      return next;
    });
  }, []);

  const currentPageLabel = resolveCurrentPage(location.pathname);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="dark flex h-screen bg-[#0A1628] text-[#F9FAFB] overflow-hidden">
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
                <span className="text-[10px] text-[#9CA3AF]">v{__APP_VERSION__}</span>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 flex flex-col gap-1 py-3 px-2 overflow-y-auto">
            {sidebarEntries.map((entry) => {
              if (entry.type === "item") {
                const Icon = entry.icon;
                const isActive = location.pathname.endsWith("/" + entry.path);
                const linkClasses = cn(
                  "flex items-center w-full rounded-md py-2 text-sm transition-colors",
                  collapsed ? "justify-center" : "gap-3 px-3",
                  isActive
                    ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                    : "text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB]"
                );
                const link = (
                  <NavLink
                    key={entry.path}
                    to={`/admin/${entry.path}`}
                    className={linkClasses}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{entry.label}</span>}
                  </NavLink>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={entry.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#1A2942] text-[#F9FAFB] border-white/10">
                        {entry.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return link;
              }

              // Group entry
              return (
                <SidebarGroup
                  key={entry.id}
                  entry={entry}
                  collapsed={collapsed}
                  isOpen={openGroups.has(entry.id)}
                  onToggle={() => toggleGroup(entry.id)}
                />
              );
            })}
          </nav>

          {/* Footer buttons */}
          <div className="p-2 border-t border-white/5 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open("/", "blipp-user")}
              className={cn(
                "text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5",
                collapsed ? "w-full justify-center" : "w-full justify-start gap-2"
              )}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-xs">User App</span>}
            </Button>
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
                {currentPageLabel}
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
