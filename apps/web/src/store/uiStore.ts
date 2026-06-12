import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  queuePanelOpen: boolean;
  toggleQueuePanel: () => void;
  setQueuePanelOpen: (open: boolean) => void;
  karaokeOpen: boolean;
  setKaraokeOpen: (open: boolean) => void;
  toggleKaraoke: () => void;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  openNowPlaying: () => void;
  openNowPlayingWithKaraoke: () => void;
  expandKaraokeInNowPlaying: boolean;
  clearExpandKaraokeInNowPlaying: () => void;
  closeNowPlaying: () => void;
  karaokeFullscreenOpen: boolean;
  openKaraokeFullscreen: () => void;
  closeKaraokeFullscreen: () => void;
  shortcutsHelpOpen: boolean;
  setShortcutsHelpOpen: (open: boolean) => void;
  mobileInstallOpen: boolean;
  setMobileInstallOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  queuePanelOpen: false,
  toggleQueuePanel: () => set((s) => ({ queuePanelOpen: !s.queuePanelOpen })),
  setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),
  karaokeOpen: false,
  setKaraokeOpen: (open) => set({ karaokeOpen: open }),
  toggleKaraoke: () => set((s) => ({ karaokeOpen: !s.karaokeOpen })),
  nowPlayingOpen: false,
  setNowPlayingOpen: (open) => set({ nowPlayingOpen: open }),
  expandKaraokeInNowPlaying: false,
  openNowPlaying: () =>
    set({
      nowPlayingOpen: true,
      queuePanelOpen: false,
      karaokeOpen: false,
      expandKaraokeInNowPlaying: false,
    }),
  openNowPlayingWithKaraoke: () =>
    set({
      nowPlayingOpen: true,
      queuePanelOpen: false,
      karaokeOpen: false,
      expandKaraokeInNowPlaying: true,
    }),
  clearExpandKaraokeInNowPlaying: () => set({ expandKaraokeInNowPlaying: false }),
  closeNowPlaying: () =>
    set({
      nowPlayingOpen: false,
      expandKaraokeInNowPlaying: false,
      karaokeFullscreenOpen: false,
    }),
  karaokeFullscreenOpen: false,
  openKaraokeFullscreen: () =>
    set({
      karaokeFullscreenOpen: true,
      nowPlayingOpen: false,
      karaokeOpen: false,
      queuePanelOpen: false,
    }),
  closeKaraokeFullscreen: () => set({ karaokeFullscreenOpen: false }),
  shortcutsHelpOpen: false,
  setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),
  mobileInstallOpen: false,
  setMobileInstallOpen: (open) => set({ mobileInstallOpen: open }),
}));
