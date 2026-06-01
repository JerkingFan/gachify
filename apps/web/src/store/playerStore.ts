import { create } from "zustand";
import { api } from "@/api/client";
import { addRecent } from "@/lib/storage";
import { recordPlayOnce } from "@/lib/plays";
import type { Track } from "@/types";

type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  progressMs: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** When true, fetches the next similar track when the queue ends (infinite radio). */
  radioMode: boolean;
  audio: HTMLAudioElement | null;

  setQueue: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleRadioMode: () => void;
  tick: (ms: number) => void;
  bindAudio: (el: HTMLAudioElement) => void;
  removeFromQueue: (index: number) => void;
  playQueueIndex: (index: number) => void;
  clearUpcoming: () => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  progressMs: 0,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  radioMode: true,
  audio: null,

  bindAudio(el) {
    set({ audio: el });
    el.volume = get().volume;
  },

  setQueue(tracks, startIndex = 0) {
    set({ queue: tracks, queueIndex: startIndex });
  },

  playTrack(track, queue) {
    const state = get();
    const q = queue ?? (state.queue.length ? state.queue : [track]);
    const idx = q.findIndex((t) => t.id === track.id);
    addRecent(track.id);
    recordPlayOnce(track.id);
    set({
      currentTrack: track,
      queue: q,
      queueIndex: idx >= 0 ? idx : 0,
      progressMs: 0,
      isPlaying: true,
    });
  },

  togglePlay() {
    const { audio, isPlaying } = get();
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      set({ isPlaying: false });
    } else {
      void audio.play().then(() => set({ isPlaying: true }));
    }
  },

  pause() {
    get().audio?.pause();
    set({ isPlaying: false });
  },

  next() {
    const { queue, queueIndex, repeat, currentTrack, shuffle: shuf, radioMode } = get();
    if (!queue.length || !currentTrack) return;

    if (repeat === "one") {
      get().playTrack(currentTrack, queue);
      return;
    }

    let nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) {
      if (repeat === "all") nextIdx = 0;
      else if (radioMode) {
        void appendRecommendedNext();
        return;
      } else {
        set({ isPlaying: false });
        return;
      }
    }

    let nextQueue = queue;
    if (shuf && nextIdx === 0) {
      nextQueue = shuffleArray(queue);
    }
    get().playTrack(nextQueue[nextIdx], nextQueue);
  },

  previous() {
    const { audio, progressMs, queue, queueIndex, currentTrack } = get();
    if (audio && progressMs > 3000) {
      audio.currentTime = 0;
      set({ progressMs: 0 });
      return;
    }
    if (!queue.length || !currentTrack) return;
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    get().playTrack(queue[prevIdx], queue);
  },

  seek(ms) {
    const audio = get().audio;
    if (audio && !Number.isNaN(ms)) {
      audio.currentTime = ms / 1000;
    }
    set({ progressMs: ms });
  },

  setVolume(v) {
    const vol = Math.min(1, Math.max(0, v));
    const audio = get().audio;
    if (audio) audio.volume = vol;
    set({ volume: vol });
  },

  toggleShuffle() {
    set((s) => ({ shuffle: !s.shuffle }));
  },

  cycleRepeat() {
    const order: RepeatMode[] = ["off", "all", "one"];
    set((s) => ({
      repeat: order[(order.indexOf(s.repeat) + 1) % order.length],
    }));
  },

  toggleRadioMode() {
    set((s) => ({ radioMode: !s.radioMode }));
  },

  tick(ms) {
    set({ progressMs: ms });
  },

  removeFromQueue(index) {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length) return;
    const next = queue.filter((_, i) => i !== index);
    let nextIndex = queueIndex;
    if (index < queueIndex) nextIndex--;
    else if (index === queueIndex) {
      if (!next.length) {
        set({ queue: [], queueIndex: 0, currentTrack: null, isPlaying: false });
        get().audio?.pause();
        return;
      }
      const playIdx = Math.min(queueIndex, next.length - 1);
      get().playTrack(next[playIdx], next);
      return;
    }
    set({ queue: next, queueIndex: Math.max(0, nextIndex) });
  },

  playQueueIndex(index) {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    get().playTrack(queue[index], queue);
  },

  clearUpcoming() {
    const { queue, queueIndex, currentTrack } = get();
    if (!currentTrack || queueIndex >= queue.length - 1) return;
    const next = queue.slice(0, queueIndex + 1);
    set({ queue: next });
  },
}));

async function appendRecommendedNext() {
  const { currentTrack, queue } = usePlayerStore.getState();
  if (!currentTrack) {
    usePlayerStore.setState({ isPlaying: false });
    return;
  }
  const exclude = queue.slice(-20).map((t) => t.id);
  try {
    const res = await api.getRecommendNext(currentTrack.id, exclude, 5);
    const seen = new Set(queue.map((t) => t.id));
    const fresh = res.items.filter((t) => !seen.has(t.id));
    if (!fresh.length) {
      usePlayerStore.setState({ isPlaying: false });
      return;
    }
    const nextQueue = [...queue, ...fresh];
    usePlayerStore.getState().playTrack(fresh[0], nextQueue);
  } catch {
    usePlayerStore.setState({ isPlaying: false });
  }
}
