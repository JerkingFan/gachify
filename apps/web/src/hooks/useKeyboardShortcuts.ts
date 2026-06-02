import { useEffect } from "react";
import { useLibraryStore } from "@/store/libraryStore";
import { usePlayerStore } from "@/store/playerStore";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const shortcutsOpen = useUIStore.getState().shortcutsHelpOpen;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        useUIStore.setState({ shortcutsHelpOpen: !shortcutsOpen });
        return;
      }

      if (shortcutsOpen && e.key === "Escape") {
        useUIStore.setState({ shortcutsHelpOpen: false });
        return;
      }

      if (shortcutsOpen) return;

      const player = usePlayerStore.getState();
      const ui = useUIStore.getState();
      const track = player.currentTrack;

      switch (e.key) {
        case " ":
          e.preventDefault();
          player.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.previous();
          break;
        case "m":
        case "M":
          if (!track) break;
          e.preventDefault();
          void useLibraryStore
            .getState()
            .toggleLiked(track.id, useAuthStore.getState().isAuthenticated);
          break;
        case "l":
        case "L":
          if (!track) break;
          e.preventDefault();
          ui.openNowPlayingWithKaraoke();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
