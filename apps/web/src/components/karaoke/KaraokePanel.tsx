import { Maximize2, X } from "lucide-react";
import { KaraokeLyrics } from "@/components/player/KaraokeLyrics";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";
import type { LyricsDocument } from "@/types";

type Props = {
  doc: LyricsDocument;
};

export function KaraokePanel({ doc }: Props) {
  const close = useUIStore((s) => s.setKaraokeOpen);
  const openFullscreen = useUIStore((s) => s.openKaraokeFullscreen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  return (
    <div className="fixed inset-x-0 bottom-[var(--gachify-mobile-chrome-h)] z-50 mx-auto max-h-[45vh] w-full max-w-3xl rounded-t-2xl border border-white/10 bg-spotify-elevated/95 shadow-2xl backdrop-blur-md md:bottom-[100px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase text-spotify-muted">♂️ Karaoke</p>
          <p className="truncate text-sm font-semibold">{currentTrack?.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openFullscreen}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Fullscreen karaoke"
            title="Fullscreen karaoke"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close karaoke"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="px-4 py-4">
        <KaraokeLyrics doc={doc} trackId={currentTrack?.id} />
      </div>
    </div>
  );
}
