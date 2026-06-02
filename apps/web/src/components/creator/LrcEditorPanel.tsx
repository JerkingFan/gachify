import { Loader2, Mic2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { KaraokeLyrics } from "@/components/player/KaraokeLyrics";
import { parseLRC, parseLyricsFromTrack } from "@/lib/lyrics";
import { parseGachiMeta } from "@/lib/tracks";
import type { Track } from "@/types";

type Props = {
  track: Track;
  onSaved: (track: Track) => void;
};

export function LrcEditorPanel({ track, onSaved }: Props) {
  const initial = useMemo(() => {
    const meta = parseGachiMeta(track);
    const fromMeta = (meta as Record<string, unknown>).lyrics_lrc;
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta;
    const doc = parseLyricsFromTrack(meta);
    if (!doc?.lines?.length) return "";
    return doc.lines.map((l) => `[${formatLrcTime(l.start_ms)}]${l.text}`).join("\n");
  }, [track]);

  const [lrc, setLrc] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setLrc(initial), [initial]);

  const preview = useMemo(() => {
    const trimmed = lrc.trim();
    if (!trimmed) return null;
    const doc = parseLRC(trimmed);
    return doc.lines.length > 0 ? doc : null;
  }, [lrc]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateCreatorTrackLyrics(track.id, lrc.trim());
      onSaved(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-spotify-base p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mic2 className="h-4 w-4 text-spotify-green" />
        <span className="text-sm font-semibold">LRC editor & preview</span>
      </div>
      <p className="mb-3 text-xs text-spotify-muted">
        Edit before publish — saved lines sync on upload/worker. Play the track to preview timing.
      </p>
      <textarea
        value={lrc}
        onChange={(e) => setLrc(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder="[00:12.00] First line&#10;[00:18.50] Next line"
        className="mb-3 w-full rounded-md bg-spotify-highlight px-3 py-2 font-mono text-xs leading-relaxed"
      />
      {preview ? (
        <div className="mb-3 rounded-md bg-black/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-spotify-muted">Preview</p>
          <KaraokeLyrics doc={preview} compact />
        </div>
      ) : (
        lrc.trim() && (
          <p className="mb-3 text-xs text-amber-300/90">No valid LRC timestamps found — check format [mm:ss.xx]</p>
        )
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved" : "Save lyrics"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function formatLrcTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}
