import { Outlet } from "react-router-dom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  useAudioEngine();

  return (
    <div className="flex h-screen flex-col bg-spotify-black">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-spotify-base">
          <Outlet />
        </main>
      </div>
      <QueuePanel />
      <PlayerBar />
    </div>
  );
}
