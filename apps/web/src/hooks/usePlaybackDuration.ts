import { usePlayerStore } from "@/store/playerStore";

/** Scrubber total length: prefer real audio duration over catalog metadata. */
export function usePlaybackDuration(): number {
  const track = usePlayerStore((s) => s.currentTrack);
  const fromAudio = usePlayerStore((s) => s.playbackDurationMs);
  return fromAudio ?? track?.duration_ms ?? 0;
}
