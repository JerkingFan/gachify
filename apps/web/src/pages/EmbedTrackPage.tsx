import { ExternalLink, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { CoverArt } from "@/components/ui/CoverArt";
import { formatDuration, getArtistName, getPreviewUrl, parseGachiMeta } from "@/lib/tracks";
import type { Track } from "@/types";

/** Minimal iframe player for Discord / forums / Telegram embeds. */
export function EmbedTrackPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const autoplay = params.get("autoplay") !== "0";
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!id) return;
    void api
      .getTrack(id)
      .then(setTrack)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [id]);

  useEffect(() => {
    if (!track || !autoplay) return;
    const audio = audioRef.current;
    if (!audio) return;

    const load = async () => {
      let src = getPreviewUrl(track);
      if (!src) {
        try {
          const pb = await api.getPlayback(track.id);
          src = pb.fallback_url ?? pb.playlist_url ?? null;
        } catch {
          /* no stream */
        }
      }
      if (!src) {
        setNeedsTap(true);
        return;
      }
      audio.src = src;
      audio.volume = 0.85;
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setNeedsTap(true);
      }
    };
    void load();
  }, [track, autoplay]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (!audio.src) {
      const src = getPreviewUrl(track);
      if (src) audio.src = src;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
        setNeedsTap(false);
      } catch {
        setNeedsTap(true);
      }
    }
  };

  if (error) {
    return (
      <div className="flex min-h-[152px] items-center justify-center bg-[#121212] p-4 text-sm text-neutral-400">
        {error}
      </div>
    );
  }

  if (!track) {
    return (
      <div className="flex min-h-[152px] items-center justify-center bg-[#121212]">
        <Loader2 className="h-6 w-6 animate-spin text-[#1ed760]" />
      </div>
    );
  }

  const meta = parseGachiMeta(track);

  return (
    <div className="flex h-[152px] w-full max-w-[460px] items-center gap-3 bg-gradient-to-r from-[#282828] to-[#121212] p-3 text-white">
      <audio ref={audioRef} preload="auto" onEnded={() => setPlaying(false)} />
      <CoverArt track={track} size="md" className="h-20 w-20 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{track.title}</p>
        <p className="truncate text-xs text-neutral-400">{getArtistName(track)}</p>
        <p className="mt-0.5 text-[10px] text-neutral-500">
          {formatDuration(track.duration_ms)}
          {meta.gachi_power_level != null && ` · ♂️ ${meta.gachi_power_level}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggle()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1ed760] text-black"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
          {needsTap && !playing && (
            <span className="text-[10px] text-neutral-400">Tap to play preview</span>
          )}
          <Link
            to={`/track/${track.id}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-[#1ed760] hover:underline"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
