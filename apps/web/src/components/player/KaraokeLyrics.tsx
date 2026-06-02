import { Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activeLyricIndex } from "@/lib/lyrics";
import { usePlayerStore } from "@/store/playerStore";
import type { LyricsDocument } from "@/types";

type KaraokeLyricsProps = {
  doc: LyricsDocument;
  trackId?: string;
  fullscreen?: boolean;
  compact?: boolean;
};

export function KaraokeLyrics({ doc, trackId, compact, fullscreen }: KaraokeLyricsProps) {
  const progressMs = usePlayerStore((s) => s.progressMs);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const active = activeLyricIndex(doc.lines, progressMs);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  const shareMoment = async () => {
    if (!trackId || active < 0) return;
    const line = doc.lines[active];
    const sec = Math.floor(line.start_ms / 1000);
    const url = `${window.location.origin}/track/${trackId}?t=${sec}`;
    const text = `"${line.text}" — ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, text: line.text, title: "Gachify moment" });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div
      className={
        fullscreen
          ? "h-full w-full max-w-2xl overflow-y-auto px-4 py-6 text-center"
          : compact
            ? "max-h-40 overflow-y-auto text-center"
            : "max-h-[32vh] overflow-y-auto px-2 py-2 text-center"
      }
    >
      {trackId && active >= 0 && !compact && (
        <div className="mb-2 flex justify-center">
          <button
            type="button"
            onClick={() => void shareMoment()}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/10"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Share this moment"}
          </button>
        </div>
      )}
      {doc.lines.map((line, i) => {
        const isActive = i === active;
        const isPast = i < active;
        return (
          <div
            key={`${line.start_ms}-${i}`}
            ref={isActive ? activeRef : undefined}
            className={`py-1.5 transition-all duration-200 ${
              fullscreen ? "text-2xl md:text-4xl" : compact ? "text-base" : "text-lg md:text-2xl"
            } ${
              isActive
                ? "scale-[1.02] font-bold text-spotify-green"
                : isPast
                  ? "text-white/40"
                  : "text-white/75"
            }`}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
