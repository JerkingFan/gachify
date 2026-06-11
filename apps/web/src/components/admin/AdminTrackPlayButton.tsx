import Hls from "hls.js";
import { Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { attachAdminPlayback, stopAdminPlayback } from "@/lib/adminPlayback";

let activeStop: (() => void) | null = null;

type Props = {
  trackId: string;
  className?: string;
};

export function AdminTrackPlayButton({ trackId, className = "" }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopSelfRef = useRef(() => {});

  stopSelfRef.current = () => {
    stopAdminPlayback(audioRef.current, hlsRef);
    setPlaying(false);
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    const stopSelf = () => stopSelfRef.current();
    return () => {
      if (activeStop === stopSelf) activeStop = null;
      stopAdminPlayback(audio, hlsRef);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const stopSelf = () => stopSelfRef.current();

    if (playing) {
      stopSelf();
      if (activeStop === stopSelf) activeStop = null;
      return;
    }

    if (activeStop && activeStop !== stopSelf) {
      activeStop();
    }

    setError(null);
    setLoading(true);
    try {
      const playback = await adminApi.getPlayback(trackId);
      await attachAdminPlayback(audio, playback, hlsRef);
      await audio.play();
      activeStop = stopSelf;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback failed");
      stopSelf();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 hover:bg-white/10 disabled:opacity-50"
        title={playing ? "Pause preview" : "Play preview"}
        aria-label={playing ? "Pause preview" : "Play preview"}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 pl-0.5" />
        )}
      </button>
      {error && (
        <span className="max-w-[140px] truncate text-[10px] text-amber-200" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
