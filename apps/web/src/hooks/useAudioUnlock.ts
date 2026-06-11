import { useEffect, type RefObject } from "react";
import { unlockNativeAudio } from "@/lib/mobileMedia";
import { isNativeApp } from "@/lib/native";

/**
 * iOS PWA: first tap must unlock audio. Native uses unlockNativeAudio on each playTrack.
 */
export function useAudioUnlock(audioRef: RefObject<HTMLAudioElement | null>) {
  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (isNativeApp()) {
        unlockNativeAudio(audio);
        return;
      }
      const prev = audio.volume;
      audio.muted = true;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.muted = false;
          audio.volume = prev;
        })
        .catch(() => {
          audio.muted = false;
          audio.volume = prev;
        });
    };

    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [audioRef]);
}
