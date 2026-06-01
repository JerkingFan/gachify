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
}));
