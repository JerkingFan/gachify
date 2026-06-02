import { Minimize2 } from "lucide-react";
import { KaraokeLyrics } from "@/components/player/KaraokeLyrics";
import { formatDuration } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";
import type { LyricsDocument } from "@/types";

type Props = {
  doc: LyricsDocument;
};

export function KaraokeFullscreen({ doc }: Props) {
  const close = useUIStore((s) => s.closeKaraokeFullscreen);
  const track = usePlayerStore((s) => s.currentTrack);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const duration = track?.duration_ms ?? 0;
  const seek = usePlayerStore((s) => s.seek);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-spotify-green">♂️ Karaoke</p>
          <p className="truncate text-sm font-semibold">{track?.title}</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="btn-icon touch-target"
          aria-label="Exit fullscreen karaoke"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-8">
        <KaraokeLyrics doc={doc} trackId={track?.id} fullscreen />
      </div>

      <footer className="shrink-0 border-t border-white/10 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto flex max-w-lg items-center gap-3 text-xs text-spotify-muted">
          <span className="w-10 tabular-nums">{formatDuration(progressMs)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progressMs}
            onChange={(e) => seek(Number(e.target.value))}
            className="player-scrubber h-2 flex-1 accent-spotify-green"
            aria-label="Seek"
          />
          <span className="w-10 tabular-nums">{formatDuration(duration)}</span>
        </div>
      </footer>
    </div>
  );
}
