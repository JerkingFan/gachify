import { create } from "zustand";
import { api } from "@/api/client";
import { shouldCrossfade, shouldGapless } from "@/lib/continuousMix";
import { unlockNativeAudio } from "@/lib/mobileMedia";
import { addRecent } from "@/lib/storage";
import { recordPlayOnce } from "@/lib/plays";
import type { Track } from "@/types";

type RepeatMode = "off" | "all" | "one";
export type EqPreset = "off" | "bass" | "dungeon";

const EQ_KEY = "gachify:eq-preset";
const INCOGNITO_KEY = "gachify:incognito";
const RATE_KEY = "gachify:playback-rate";

export type PlaybackRate = 0.75 | 1 | 1.25 | 1.5;

function loadIncognito(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(INCOGNITO_KEY) === "1";
}

function loadPlaybackRate(): PlaybackRate {
  if (typeof window === "undefined") return 1;
  const v = Number(localStorage.getItem(RATE_KEY));
  if (v === 0.75 || v === 1.25 || v === 1.5) return v;
  return 1;
}

function loadEqPreset(): EqPreset {
  if (typeof window === "undefined") return "off";
  const v = localStorage.getItem(EQ_KEY);
  return v === "bass" || v === "dungeon" ? v : "off";
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  progressMs: number;
  /** Real duration from the audio element when known (HLS/MP3). */
  playbackDurationMs: number | null;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** When true, fetches the next similar track when the queue ends (infinite radio). */
  radioMode: boolean;
  /** Next track load should crossfade (continuous mix). */
  crossfadeOnLoad: boolean;
  /** Near-instant transition for back-to-back DJ mixes. */
  gaplessOnLoad: boolean;
  eqPreset: EqPreset;
  incognito: boolean;
  playbackRate: PlaybackRate;
  sleepTimerEndsAt: number | null;
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
  /** Play track with radio on and prefetch similar tracks into the queue. */
  startRadio: (track: Track, seedQueue?: Track[]) => Promise<void>;
  tick: (ms: number) => void;
  bindAudio: (el: HTMLAudioElement) => void;
  removeFromQueue: (index: number) => void;
  playQueueIndex: (index: number) => void;
  clearUpcoming: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  setEqPreset: (preset: EqPreset) => void;
  toggleIncognito: () => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  setSleepTimer: (minutes: number | null) => void;
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
  playbackDurationMs: null,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  radioMode: true,
  crossfadeOnLoad: false,
  gaplessOnLoad: false,
  eqPreset: loadEqPreset(),
  incognito: loadIncognito(),
  playbackRate: loadPlaybackRate(),
  sleepTimerEndsAt: null,
  audio: null,

  bindAudio(el) {
    set({ audio: el });
    el.muted = false;
    el.volume = get().volume;
  },

  setQueue(tracks, startIndex = 0) {
    set({ queue: tracks, queueIndex: startIndex });
  },

  playTrack(track, queue) {
    unlockNativeAudio(get().audio);
    const state = get();
    const q = queue ?? (state.queue.length ? state.queue : [track]);
    const idx = q.findIndex((t) => t.id === track.id);
    const gapless =
      state.currentTrack != null &&
      state.currentTrack.id !== track.id &&
      shouldGapless(state.currentTrack, track);
    const crossfade =
      !gapless &&
      state.currentTrack != null &&
      state.currentTrack.id !== track.id &&
      shouldCrossfade(state.currentTrack, track);
    if (!state.incognito) {
      addRecent(track.id);
      recordPlayOnce(track.id);
    }
    set({
      currentTrack: track,
      queue: q,
      queueIndex: idx >= 0 ? idx : 0,
      progressMs: 0,
      playbackDurationMs: null,
      isPlaying: true,
      crossfadeOnLoad: crossfade,
      gaplessOnLoad: gapless,
    });
  },

  togglePlay() {
    const { audio, isPlaying } = get();
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      set({ isPlaying: false });
    } else {
      audio.muted = false;
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
    const { playbackDurationMs, currentTrack } = get();
    const cap = playbackDurationMs ?? currentTrack?.duration_ms ?? 0;
    const clamped = Math.max(0, cap > 0 ? Math.min(ms, cap) : ms);
    if (audio && Number.isFinite(clamped)) {
      audio.currentTime = clamped / 1000;
    }
    set({ progressMs: clamped });
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

  async startRadio(track, seedQueue) {
    set({ radioMode: true });
    const base = seedQueue?.length ? seedQueue : [track];
    const idx = base.findIndex((t) => t.id === track.id);
    try {
      const exclude = base.map((t) => t.id);
      const res = await api.getRecommendNext(track.id, exclude, 10);
      const seen = new Set(exclude);
      const fresh = res.items.filter((t) => !seen.has(t.id));
      const queue = fresh.length ? [...base, ...fresh] : base;
      get().playTrack(track, queue);
      if (idx >= 0) set({ queueIndex: idx });
    } catch {
      get().playTrack(track, base);
    }
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

  reorderQueue(fromIndex, toIndex) {
    const { queue, queueIndex } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex >= queue.length
    ) {
      return;
    }
    const next = [...queue];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    let nextIndex = queueIndex;
    if (fromIndex === queueIndex) nextIndex = toIndex;
    else if (fromIndex < queueIndex && toIndex >= queueIndex) nextIndex--;
    else if (fromIndex > queueIndex && toIndex <= queueIndex) nextIndex++;
    set({ queue: next, queueIndex: nextIndex });
  },

  setEqPreset(preset) {
    localStorage.setItem(EQ_KEY, preset);
    set({ eqPreset: preset });
  },

  toggleIncognito() {
    const next = !get().incognito;
    sessionStorage.setItem(INCOGNITO_KEY, next ? "1" : "0");
    set({ incognito: next });
  },

  setPlaybackRate(rate) {
    localStorage.setItem(RATE_KEY, String(rate));
    const audio = get().audio;
    if (audio) audio.playbackRate = rate;
    set({ playbackRate: rate });
  },

  setSleepTimer(minutes) {
    if (minutes == null || minutes <= 0) {
      set({ sleepTimerEndsAt: null });
      return;
    }
    set({ sleepTimerEndsAt: Date.now() + minutes * 60_000 });
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
