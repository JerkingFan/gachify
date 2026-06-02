import { useEffect } from "react";
import { usePlayerStore } from "@/store/playerStore";

/** Updates document title with now playing — visible when tab is pinned or linked. */
export function useDiscordStatus() {
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    if (track && isPlaying) {
      document.title = `▶ ${track.title} · Gachify`;
    } else {
      document.title = "Gachify";
    }
    return () => {
      document.title = "Gachify";
    };
  }, [track?.id, track?.title, isPlaying]);
}

export function formatDiscordStatus(trackTitle: string, trackId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `🎵 ${trackTitle} on Gachify\n${origin}/track/${trackId}`;
}

export async function copyDiscordStatus(trackTitle: string, trackId: string): Promise<boolean> {
  const text = formatDiscordStatus(trackTitle, trackId);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
