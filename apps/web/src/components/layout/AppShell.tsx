import { Outlet } from "react-router-dom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { MobileBottomNav } from "./MobileBottomNav";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { Sidebar } from "./Sidebar";
import { useUIStore } from "@/store/uiStore";

export function AppShell() {
  useAudioEngine();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <div className="flex h-[100dvh] flex-col bg-spotify-black">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {sidebarOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              aria-label="Close menu overlay"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 md:hidden">
              <Sidebar mobile />
            </div>
          </>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-spotify-base pb-[calc(72px+52px)] md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
      <QueuePanel />
      <PlayerBar />
    </div>
  );
}
