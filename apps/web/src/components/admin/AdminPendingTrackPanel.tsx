import Hls from "hls.js";
import { Loader2, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminApi,
  type AdminTrackUpdate,
} from "@/lib/adminApi";
import { formatDuration, parseGachiMeta } from "@/lib/tracks";
import type { Track } from "@/types";

type Props = {
  trackId: string;
  onClose: () => void;
  onSaved: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
};

export function AdminPendingTrackPanel({
  trackId,
  onClose,
  onSaved,
  onApprove,
  onReject,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [gachiPower, setGachiPower] = useState(50);
  const [deepness, setDeepness] = useState(0.5);
  const [dominantSample, setDominantSample] = useState("");
  const [gruntCount, setGruntCount] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [moodTags, setMoodTags] = useState("");
  const [wessratost, setWessratost] = useState(5);
  const [continuousMix, setContinuousMix] = useState(false);

  const fillForm = useCallback((t: Track) => {
    const meta = parseGachiMeta(t);
    setTitle(t.title);
    setGachiPower(meta.gachi_power_level ?? 50);
    setDeepness(meta.deepness_score ?? 0.5);
    setDominantSample(meta.dominant_male_sample ?? "");
    setGruntCount(meta.grunt_count ?? 0);
    setBpm(meta.bpm ?? 120);
    setMoodTags((meta.mood_tags ?? []).join(", "));
    setWessratost(meta.wessratost_level ?? 5);
    setContinuousMix(Boolean(meta.is_continuous_mix));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void adminApi
      .getTrack(trackId)
      .then((t) => {
        if (cancelled) return;
        setTrack(t);
        fillForm(t);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load track");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, fillForm]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, []);

  const stopPlayback = () => {
    const audio = audioRef.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaying(false);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      return;
    }

    setPlayError(null);
    try {
      const playback = await adminApi.getPlayback(trackId);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      if (
        playback.format === "hls" &&
        playback.playlist_url &&
        Hls.isSupported()
      ) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(playback.playlist_url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void audio.play().catch(() => setPlayError("Playback blocked"));
        });
        hls.on(Hls.Events.ERROR, (_event: string, data: { fatal?: boolean }) => {
          if (data.fatal && playback.fallback_url) {
            hls.destroy();
            hlsRef.current = null;
            audio.src = playback.fallback_url;
            void audio.play();
          } else if (data.fatal) {
            setPlayError("HLS playback failed");
          }
        });
        return;
      }

      const src = playback.fallback_url;
      if (!src) {
        setPlayError("No preview stream available (transcode may still be running)");
        return;
      }
      audio.src = src;
      await audio.play();
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : "Playback failed");
    }
  };

  const buildUpdate = (): AdminTrackUpdate => ({
    title: title.trim(),
    gachi_power_level: gachiPower,
    deepness_score: deepness,
    dominant_male_sample: dominantSample.trim() || undefined,
    grunt_count: gruntCount,
    bpm,
    mood_tags: moodTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    wessratost_level: wessratost,
    is_continuous_mix: continuousMix,
  });

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateTrack(trackId, buildUpdate());
      setTrack(updated);
      fillForm(updated);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-md bg-spotify-highlight px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-spotify-green";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-spotify-elevated shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold">Review track</h3>
            <p className="text-xs text-spotify-muted">{trackId.slice(0, 8)}…</p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              onClose();
            }}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-spotify-green" />
            </div>
          ) : (
            <>
              {error && (
                <p className="mb-4 rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              <div className="mb-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-spotify-green text-black"
                >
                  {playing ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6 pl-0.5" />
                  )}
                </button>
                <div>
                  <p className="font-semibold">{track?.title ?? title}</p>
                  <p className="text-xs text-spotify-muted">
                    {track?.creator?.display_name ??
                      track?.creator?.handle ??
                      "Unknown"}{" "}
                    · {formatDuration(track?.duration_ms ?? 0)}
                  </p>
                  {playError && (
                    <p className="mt-1 text-xs text-amber-200">{playError}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-spotify-muted">Title</span>
                  <input
                    className={inputClass}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Gachi power ({gachiPower})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={gachiPower}
                    onChange={(e) => setGachiPower(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Deepness ({deepness.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={deepness}
                    onChange={(e) => setDeepness(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Dominant sample
                  </span>
                  <input
                    className={inputClass}
                    value={dominantSample}
                    onChange={(e) => setDominantSample(e.target.value)}
                    placeholder="billy_herrington"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">BPM</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">Grunt count</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={gruntCount}
                    onChange={(e) => setGruntCount(Number(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Wessratost ({wessratost})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={wessratost}
                    onChange={(e) => setWessratost(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Mood tags (comma-separated)
                  </span>
                  <input
                    className={inputClass}
                    value={moodTags}
                    onChange={(e) => setMoodTags(e.target.value)}
                    placeholder="dungeon, boss_fight"
                  />
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={continuousMix}
                    onChange={(e) => setContinuousMix(e.target.checked)}
                    className="h-4 w-4 accent-spotify-green"
                  />
                  <span className="text-sm">Continuous mix</span>
                </label>
              </div>
            </>
          )}
        </div>

        {!loading && (
          <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold hover:bg-white/25 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() =>
                void save()
                  .then(() => onApprove(trackId))
                  .then(onClose)
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Approve failed"),
                  )
              }
              className="rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black"
            >
              Save & approve
            </button>
            <button
              type="button"
              onClick={() =>
                void onReject(trackId)
                  .then(onClose)
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Reject failed"),
                  )
              }
              className="ml-auto rounded-full border border-red-400/50 px-5 py-2 text-sm text-red-200"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
