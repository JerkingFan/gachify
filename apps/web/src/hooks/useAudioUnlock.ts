import { useEffect, type RefObject } from "react";

/**
 * iOS requires a user gesture before audio can play in background/PWA.
 * Resume a silent play/pause once on first tap anywhere.
 */
export function useAudioUnlock(audioRef: RefObject<HTMLAudioElement | null>) {
  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const prev = audio.volume;
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.volume = prev;
        })
        .catch(() => {
          audio.volume = prev;
        });
    };

    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [audioRef]);
}
