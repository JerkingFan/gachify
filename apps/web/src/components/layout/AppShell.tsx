import { useRef } from "react";
import { Outlet } from "react-router-dom";
import { KeyboardShortcutsModal } from "@/components/help/KeyboardShortcutsModal";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { KaraokeFullscreen } from "@/components/karaoke/KaraokeFullscreen";
import { KaraokePanel } from "@/components/karaoke/KaraokePanel";
import { InstallPwaBanner } from "@/components/pwa/InstallPwaBanner";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useAudioUnlock } from "@/hooks/useAudioUnlock";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useOfflineLikedWarm } from "@/hooks/useOfflineLikedWarm";
import { usePlayerStateSync } from "@/hooks/usePlayerStateSync";
import { useSleepTimer } from "@/hooks/useSleepTimer";
import { useDiscordStatus } from "@/hooks/useDiscordStatus";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import { NowPlayingView } from "@/components/player/NowPlayingView";
import { MobileBottomNav } from "./MobileBottomNav";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { Sidebar } from "./Sidebar";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";

export function AppShell() {
  const audioRef = useRef<HTMLAudioElement>(null);
  useAudioEngine(audioRef);
  useAudioUnlock(audioRef);
  useKeyboardShortcuts();
  useMediaSession();
  useOfflineLikedWarm();
  usePlayerStateSync();
  useSleepTimer();
  useDiscordStatus();

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const karaokeOpen = useUIStore((s) => s.karaokeOpen);
  const karaokeFullscreen = useUIStore((s) => s.karaokeFullscreenOpen);
  const nowPlayingOpen = useUIStore((s) => s.nowPlayingOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const lyricsDoc = useTrackLyrics(currentTrack);

  return (
    <div className="flex h-[100dvh] flex-col bg-spotify-black">
      {/* Persistent media element — must stay in DOM for iOS / PWA background audio */}
      <audio
        ref={audioRef}
        id="gachify-player"
        className="sr-only"
        preload="auto"
        playsInline
        aria-hidden
        tabIndex={-1}
      />

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
      <KeyboardShortcutsModal />
      <OnboardingOverlay />
      <InstallPwaBanner />
      <MobileBottomNav />
      <NowPlayingView />
      <QueuePanel />
      {karaokeOpen && lyricsDoc && !nowPlayingOpen && !karaokeFullscreen && (
        <KaraokePanel doc={lyricsDoc} />
      )}
      {karaokeFullscreen && lyricsDoc && <KaraokeFullscreen doc={lyricsDoc} />}
      <PlayerBar hasLyrics={Boolean(lyricsDoc)} />
    </div>
  );
}
