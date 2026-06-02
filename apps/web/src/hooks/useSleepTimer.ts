import { useEffect } from "react";
import { usePlayerStore } from "@/store/playerStore";

/** Pause playback when the sleep timer expires. */
export function useSleepTimer() {
  const endsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const pause = usePlayerStore((s) => s.pause);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      if (Date.now() >= endsAt) {
        pause();
        setSleepTimer(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, pause, setSleepTimer]);
}
