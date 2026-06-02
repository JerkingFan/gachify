import { parseGachiMeta } from "@/lib/tracks";
import type { Track } from "@/types";

export function isContinuousMixTrack(track: Track | null | undefined): boolean {
  if (!track) return false;
  return Boolean(parseGachiMeta(track).is_continuous_mix);
}

/** Crossfade when either side of a transition is a continuous mix. */
export function shouldCrossfade(from: Track | null, to: Track | null): boolean {
  if (shouldGapless(from, to)) return false;
  return isContinuousMixTrack(from) || isContinuousMixTrack(to);
}

/** Seamless handoff when both tracks are DJ continuous mixes. */
export function shouldGapless(from: Track | null, to: Track | null): boolean {
  return isContinuousMixTrack(from) && isContinuousMixTrack(to);
}
