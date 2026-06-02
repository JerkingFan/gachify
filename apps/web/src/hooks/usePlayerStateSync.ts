import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import { usePlayerStore } from "@/store/playerStore";

const SYNC_KEY = "gachify:queue-sync";
const DEBOUNCE_MS = 2500;

function syncEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SYNC_KEY) !== "off";
}

/** Optional cross-device queue sync for logged-in users. */
export function usePlayerStateSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const seek = usePlayerStore((s) => s.seek);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !syncEnabled()) {
      hydrated.current = true;
      return;
    }
    hydrated.current = false;
    void (async () => {
      try {
        const state = await api.getPlayerState();
        if (state.track_ids.length) {
          const tracks = (
            await Promise.all(state.track_ids.map((id) => api.getTrack(id).catch(() => null)))
          ).filter(Boolean) as import("@/types").Track[];
          if (tracks.length) {
            const idx = Math.min(Math.max(0, state.queue_index), tracks.length - 1);
            setQueue(tracks, idx);
            if (state.progress_ms > 0) {
              window.setTimeout(() => seek(state.progress_ms), 400);
            }
          }
        }
      } catch {
        /* offline or first visit */
      } finally {
        hydrated.current = true;
      }
    })();
  }, [isAuthenticated, setQueue, seek]);

  useEffect(() => {
    if (!isAuthenticated || !syncEnabled() || !hydrated.current || queue.length === 0) return;
    const timer = window.setTimeout(() => {
      void api
        .putPlayerState({
          track_ids: queue.map((t) => t.id),
          queue_index: queueIndex,
          progress_ms: progressMs,
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, queue, queueIndex, progressMs]);
}

export { SYNC_KEY as PLAYER_SYNC_STORAGE_KEY };
