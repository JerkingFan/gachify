import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  queuePanelOpen: boolean;
  toggleQueuePanel: () => void;
  setQueuePanelOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  queuePanelOpen: false,
  toggleQueuePanel: () => set((s) => ({ queuePanelOpen: !s.queuePanelOpen })),
  setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),
}));
