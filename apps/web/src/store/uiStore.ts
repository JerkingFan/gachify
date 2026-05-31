import { create } from "zustand";

interface UIState {
  queuePanelOpen: boolean;
  toggleQueuePanel: () => void;
  setQueuePanelOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  queuePanelOpen: false,
  toggleQueuePanel: () => set((s) => ({ queuePanelOpen: !s.queuePanelOpen })),
  setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),
}));
