import { useEffect } from "react";
import { getArtistName } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";

const DEFAULT_ART = "/pwa-512.svg";

export function useMediaSession() {
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      const { audio, isPlaying } = usePlayerStore.getState();
      if (!isPlaying && audio) {
        void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
      }
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      usePlayerStore.getState().pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      const { progressMs, seek } = usePlayerStore.getState();
      seek(Math.max(0, progressMs - 10_000));
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      const { progressMs, seek, currentTrack } = usePlayerStore.getState();
      const max = currentTrack?.duration_ms ?? progressMs + 10_000;
      seek(Math.min(max, progressMs + 10_000));
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [next, previous]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const artwork = [
      { src: `${origin}${DEFAULT_ART}`, sizes: "512x512", type: "image/svg+xml" },
      { src: `${origin}/pwa-192.svg`, sizes: "192x192", type: "image/svg+xml" },
    ];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: getArtistName(track),
      album: "Gachify",
      artwork,
    });
  }, [track?.id, track?.title]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);
}
