import { Mic2 } from "lucide-react";
import { useUIStore } from "@/store/uiStore";

type KaraokeButtonProps = {
  hasLyrics: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "pill";
  className?: string;
};

export function KaraokeButton({
  hasLyrics,
  size = "md",
  variant = "icon",
  className = "",
}: KaraokeButtonProps) {
  const openNowPlayingWithKaraoke = useUIStore((s) => s.openNowPlayingWithKaraoke);
  const openKaraokeFullscreen = useUIStore((s) => s.openKaraokeFullscreen);
  const karaokeFullscreen = useUIStore((s) => s.karaokeFullscreenOpen);

  const iconClass =
    size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";

  const onClick = () => {
    if (!hasLyrics) return;
    openNowPlayingWithKaraoke();
  };

  const onLongPress = (e: React.MouseEvent) => {
    if (!hasLyrics) return;
    if (e.shiftKey) {
      e.preventDefault();
      openKaraokeFullscreen();
    }
  };

  if (variant === "pill") {
    return (
      <button
        type="button"
        disabled={!hasLyrics}
        onClick={onClick}
        onDoubleClick={onLongPress}
        title={
          hasLyrics
            ? "Karaoke lyrics · double-click (or Shift+click) for fullscreen"
            : "No synced lyrics on this track"
        }
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
          hasLyrics
            ? "bg-spotify-green text-black hover:scale-[1.02]"
            : "cursor-not-allowed border border-white/20 text-spotify-muted opacity-60"
        } ${className}`}
      >
        <Mic2 className={iconClass} />
        Karaoke
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={!hasLyrics}
      onClick={onClick}
      onDoubleClick={onLongPress}
      className={`btn-icon touch-target ${hasLyrics ? "text-spotify-green hover:text-white" : "text-white/30"} ${karaokeFullscreen && hasLyrics ? "ring-1 ring-spotify-green/50" : ""} ${className}`}
      aria-label={hasLyrics ? "Open karaoke lyrics" : "Karaoke unavailable"}
      title={
        hasLyrics
          ? "Karaoke · open Now Playing · Shift+double-click fullscreen"
          : "No karaoke lyrics — browse tracks with LRC"
      }
    >
      <Mic2 className={iconClass} />
    </button>
  );
}
