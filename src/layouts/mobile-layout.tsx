import { Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { BottomNav } from "../components/bottom-nav";

export function MobileLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-lg font-bold">Blipp</span>
        <UserButton />
      </header>

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-20">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <BottomNav />
    </div>
  );
}
