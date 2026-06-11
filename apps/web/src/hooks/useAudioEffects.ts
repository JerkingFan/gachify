import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";
import { usePlayerStore, type EqPreset } from "@/store/playerStore";

type EffectChain = {
  ctx: AudioContext;
  bass: BiquadFilterNode;
  mid: BiquadFilterNode;
  treble: BiquadFilterNode;
};

const chains = new WeakMap<HTMLAudioElement, EffectChain>();

function presetGains(preset: EqPreset): { bass: number; mid: number; treble: number } {
  switch (preset) {
    case "bass":
      return { bass: 10, mid: 0, treble: -1 };
    case "dungeon":
      return { bass: 8, mid: 3, treble: 4 };
    default:
      return { bass: 0, mid: 0, treble: 0 };
  }
}

function connectChain(audio: HTMLAudioElement): EffectChain | null {
  if (chains.has(audio)) return chains.get(audio)!;
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const bass = ctx.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 120;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 900;
    mid.Q.value = 0.8;
    const treble = ctx.createBiquadFilter();
    treble.type = "highshelf";
    treble.frequency.value = 4500;
    source.connect(bass).connect(mid).connect(treble).connect(ctx.destination);
    const chain = { ctx, bass, mid, treble };
    chains.set(audio, chain);
    return chain;
  } catch {
    return null;
  }
}

function applyPreset(chain: EffectChain, preset: EqPreset) {
  const g = presetGains(preset);
  chain.bass.gain.value = g.bass;
  chain.mid.gain.value = g.mid;
  chain.treble.gain.value = g.treble;
}

function resumeChain(audio: HTMLAudioElement) {
  const chain = chains.get(audio);
  if (chain?.ctx.state === "suspended") void chain.ctx.resume();
}

/** Web Audio EQ — only when preset is not "off" (avoids silent playback on suspended context). */
export function useAudioEffects(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const eqPreset = usePlayerStore((s) => s.eqPreset);

  useEffect(() => {
    if (isNativeApp()) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => resumeChain(audio);
    audio.addEventListener("play", onPlay);
    return () => audio.removeEventListener("play", onPlay);
  }, [audioRef]);

  useEffect(() => {
    if (isNativeApp()) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (eqPreset === "off") return;

    const existing = chains.get(audio);
    const chain = existing ?? connectChain(audio);
    if (chain) {
      applyPreset(chain, eqPreset);
      resumeChain(audio);
    }
  }, [audioRef, eqPreset]);
}
