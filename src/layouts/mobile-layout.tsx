import { Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { BottomNav } from "../components/bottom-nav";
import { AudioProvider, useAudio } from "../contexts/audio-context";
import { MiniPlayer } from "../components/mini-player";

function MobileLayoutInner() {
  const { currentItem } = useAudio();
  const hasMiniPlayer = currentItem !== null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-lg font-bold">Blipp</span>
        <UserButton />
      </header>

      {/* Scrollable content area */}
      <main
        className={`flex-1 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? "pb-36" : "pb-20"}`}
      >
        <Outlet />
      </main>

      {/* Mini-player (above bottom nav) */}
      {hasMiniPlayer && <MiniPlayer />}

      {/* Bottom nav */}
      <BottomNav />
    </div>
  );
}

export function MobileLayout() {
  return (
    <AudioProvider>
      <MobileLayoutInner />
    </AudioProvider>
  );
}
