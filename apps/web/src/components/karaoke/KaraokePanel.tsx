import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { activeLyricIndex } from "@/lib/lyrics";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";
import type { LyricsDocument } from "@/types";

type Props = {
  doc: LyricsDocument;
};

export function KaraokePanel({ doc }: Props) {
  const close = useUIStore((s) => s.setKaraokeOpen);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const active = activeLyricIndex(doc.lines, progressMs);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div className="fixed inset-x-0 bottom-[90px] z-50 mx-auto max-h-[45vh] w-full max-w-3xl rounded-t-2xl border border-white/10 bg-spotify-elevated/95 shadow-2xl backdrop-blur-md md:bottom-[100px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase text-spotify-muted">♂️ Karaoke</p>
          <p className="truncate text-sm font-semibold">{currentTrack?.title}</p>
        </div>
        <button
          type="button"
          onClick={() => close(false)}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Close karaoke"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[36vh] overflow-y-auto px-6 py-6 text-center">
        {doc.lines.map((line, i) => {
          const isActive = i === active;
          const isPast = i < active;
          return (
            <div
              key={`${line.start_ms}-${i}`}
              ref={isActive ? activeRef : undefined}
              className={`py-2 text-lg transition-all duration-200 md:text-2xl ${
                isActive
                  ? "scale-105 font-bold text-spotify-green"
                  : isPast
                    ? "text-white/40"
                    : "text-white/70"
              }`}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
