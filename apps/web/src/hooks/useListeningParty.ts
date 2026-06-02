import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import { usePlayerStore } from "@/store/playerStore";
import type { PartyState, Track } from "@/types";

const PARTY_HOST_KEY = "gachify:party-host";

export function getStoredPartyHost(code: string): string | null {
  try {
    const raw = sessionStorage.getItem(PARTY_HOST_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[code] ?? null;
  } catch {
    return null;
  }
}

export function storePartyHost(code: string, token: string) {
  try {
    const raw = sessionStorage.getItem(PARTY_HOST_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[code] = token;
    sessionStorage.setItem(PARTY_HOST_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Host pushes player state; guests follow via SSE. */
export function useListeningParty(code: string | null, hostToken: string | null) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const seek = usePlayerStore((s) => s.seek);
  const pause = usePlayerStore((s) => s.pause);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const applying = useRef(false);
  const hostTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!code || !hostToken) return;
    if (hostTimer.current) window.clearTimeout(hostTimer.current);
    hostTimer.current = window.setTimeout(() => {
      void api
        .updateListeningParty(code, {
          host_token: hostToken,
          track_ids: queue.map((t) => t.id),
          queue_index: queueIndex,
          progress_ms: progressMs,
          is_playing: isPlaying,
          updated_at: Date.now(),
        })
        .catch(() => {});
    }, 800);
    return () => {
      if (hostTimer.current) window.clearTimeout(hostTimer.current);
    };
  }, [code, hostToken, queue, queueIndex, progressMs, isPlaying]);

  useEffect(() => {
    if (!code || hostToken) return;

    const es = new EventSource(`/api/v1/parties/${encodeURIComponent(code)}/events`);
    const apply = async (state: PartyState) => {
      if (applying.current) return;
      applying.current = true;
      try {
        const tracks = (
          await Promise.all(state.track_ids.map((id) => api.getTrack(id).catch(() => null)))
        ).filter(Boolean) as Track[];
        if (!tracks.length) return;
        const idx = Math.min(Math.max(0, state.queue_index), tracks.length - 1);
        const current = tracks[idx];
        const cur = usePlayerStore.getState().currentTrack;
        if (!cur || cur.id !== current.id) {
          setQueue(tracks, idx);
          playTrack(current, tracks);
        }
        if (Math.abs(usePlayerStore.getState().progressMs - state.progress_ms) > 2500) {
          seek(state.progress_ms);
        }
        if (state.is_playing && !usePlayerStore.getState().isPlaying) {
          void usePlayerStore.getState().audio?.play();
        } else if (!state.is_playing && usePlayerStore.getState().isPlaying) {
          pause();
        }
      } finally {
        applying.current = false;
      }
    };

    es.addEventListener("state", (ev) => {
      try {
        const state = JSON.parse((ev as MessageEvent).data) as PartyState;
        void apply(state);
      } catch {
        /* ignore */
      }
    });

    void api.getListeningParty(code).then((r) => void apply(r.state)).catch(() => {});

    return () => es.close();
  }, [code, hostToken, setQueue, playTrack, seek, pause]);
}
