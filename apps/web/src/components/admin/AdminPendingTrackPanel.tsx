import Hls from "hls.js";
import { Loader2, Pause, Play, X } from "lucide-react";
import { attachAdminPlayback, stopAdminPlayback } from "@/lib/adminPlayback";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminApi,
  type AdminPublishInput,
  type AdminTrackUpdate,
} from "@/lib/adminApi";
import { recommendationMatchScore } from "@/lib/recommendation";
import {
  formatDuration,
  getTrackAnalysisStatus,
  parseGachiMeta,
} from "@/lib/tracks";
import type { GachiMetadata, Track } from "@/types";

type Props = {
  trackId: string;
  initialArtistName?: string;
  onClose: () => void;
  onSaved: () => void;
  onReject: (id: string) => Promise<void>;
};

export function AdminPendingTrackPanel({
  trackId,
  initialArtistName = "",
  onClose,
  onSaved,
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
  const [artistName, setArtistName] = useState(initialArtistName);
  const [artistHandle, setArtistHandle] = useState("");
  const [gachiPower, setGachiPower] = useState(50);
  const [deepness, setDeepness] = useState(5);
  const [dominantSample, setDominantSample] = useState("");
  const [gruntCount, setGruntCount] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [moodTags, setMoodTags] = useState("");
  const [wessratost, setWessratost] = useState(5);
  const [continuousMix, setContinuousMix] = useState(false);
  const [energy, setEnergy] = useState(0.5);
  const [valence, setValence] = useState(0.5);
  const [danceability, setDanceability] = useState(0.5);
  const [wackiness, setWackiness] = useState(0.5);

  const analysisStatus = getTrackAnalysisStatus(track);
  const analyzerError =
    track?.gachi_metadata &&
    typeof track.gachi_metadata === "object" &&
    typeof (track.gachi_metadata as Record<string, unknown>).analyzer_error ===
      "string"
      ? String((track.gachi_metadata as Record<string, unknown>).analyzer_error)
      : null;

  const fillForm = useCallback((t: Track) => {
    const meta = parseGachiMeta(t);
    setTitle(t.title);
    // Only pre-fill fields that exist in DB — avoid fake "50 / 120 / 0.5" defaults.
    setGachiPower(
      typeof meta.gachi_power_level === "number" ? meta.gachi_power_level : 50,
    );
    setDeepness(typeof meta.deepness_score === "number" ? meta.deepness_score : 5);
    setEnergy(typeof meta.energy === "number" ? meta.energy : 0.5);
    setValence(typeof meta.valence === "number" ? meta.valence : 0.5);
    setDanceability(
      typeof meta.danceability === "number" ? meta.danceability : 0.5,
    );
    setWackiness(
      typeof meta.wackiness_score === "number" ? meta.wackiness_score : 0.5,
    );
    setDominantSample(meta.dominant_male_sample ?? "");
    setGruntCount(typeof meta.grunt_count === "number" ? meta.grunt_count : 0);
    setBpm(typeof meta.bpm === "number" ? meta.bpm : 120);
    setMoodTags((meta.mood_tags ?? []).join(", "));
    setWessratost(
      typeof meta.wessratost_level === "number" ? meta.wessratost_level : 5,
    );
    setContinuousMix(Boolean(meta.is_continuous_mix));
  }, []);

  useEffect(() => {
    setArtistName(initialArtistName);
  }, [initialArtistName, trackId]);

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
    stopAdminPlayback(audioRef.current, hlsRef);
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
      await attachAdminPlayback(audio, playback, hlsRef);
      await audio.play();
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : "Playback failed");
    }
  };

  const buildMeta = (): GachiMetadata => ({
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
    energy,
    valence,
    danceability,
    wackiness_score: wackiness,
  });

  const buildUpdate = (): AdminTrackUpdate => ({
    title: title.trim(),
    ...buildMeta(),
  });

  const buildPublish = (): AdminPublishInput => ({
    ...buildUpdate(),
    artist_display_name: artistName.trim(),
    artist_handle: artistHandle.trim() || undefined,
  });

  const previewVector = buildMeta();
  const exampleMatch = recommendationMatchScore(previewVector, {
    ...previewVector,
    bpm: (bpm + 8) % 200,
    mood_tags: [...(previewVector.mood_tags ?? []), "radio_fill"],
  });

  const publish = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!artistName.trim()) {
      setError("Artist name is required to publish");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminApi.publishTrack(trackId, buildPublish());
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setSaving(false);
    }
  };

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
            <h3 className="text-lg font-bold">Publish &amp; tune stats</h3>
            <p className="text-xs text-spotify-muted">
              {trackId.slice(0, 8)}… · stats drive autoplay recommendations
            </p>
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

              {analysisStatus === "analyzed" ? (
                <p className="mb-4 rounded-lg border border-spotify-green/40 bg-spotify-green/15 px-3 py-2 text-xs text-emerald-100">
                  <strong>gachi_analyzer</strong> уже посчитал статы по аудиофайлу. Проверьте
                  значения и нажмите Publish.
                </p>
              ) : analysisStatus === "skipped" ? (
                <p className="mb-4 rounded-lg border border-red-500/40 bg-red-900/30 px-3 py-2 text-xs text-red-100">
                  Анализатор <strong>не запустился</strong> на воркере.
                  {analyzerError ? (
                    <>
                      {" "}
                      Причина: <code className="text-red-50">{analyzerError}</code>
                    </>
                  ) : null}{" "}
                  Пересоберите образ worker с Python (
                  <code className="text-red-50">build --no-cache worker</code>) и проверьте логи:{" "}
                  <code className="text-red-50">docker compose logs worker --tail 50</code>.
                  Сейчас в форме — только то, что было при загрузке (обычно Power 50 и Deepness
                  5), остальное — заглушки интерфейса.
                </p>
              ) : (
                <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Анализ ещё <strong>не выполнен</strong> (старый worker без gachi_analyzer или
                  трек обработан до обновления). Power/Deepness 50 и 5 — с формы загрузки; Energy,
                  Valence, BPM 120 и т.д. — <strong>не из анализа</strong>, а значения по умолчанию
                  в админке. Заполните вручную или перезапустите transcode на новом worker.
                </p>
              )}

              {track?.gachi_metadata && (
                <details className="mb-4 text-xs text-spotify-muted">
                  <summary className="cursor-pointer hover:text-white">
                    Сырые метаданные в базе
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px]">
                    {JSON.stringify(track.gachi_metadata, null, 2)}
                  </pre>
                </details>
              )}

              <p className="mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-spotify-muted">
                Recommendation score preview (similar track):{" "}
                <span className="font-semibold text-spotify-green">{exampleMatch}</span>
                — overlap on mood tags, BPM, power, deepness, energy drives Gachi radio.
              </p>

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
                    Artist name (shown in player)
                  </span>
                  <input
                    className={inputClass}
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder="Van Darkholme"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Artist handle (optional)
                  </span>
                  <input
                    className={inputClass}
                    value={artistHandle}
                    onChange={(e) => setArtistHandle(e.target.value)}
                    placeholder="van_darkholme"
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
                    Deepness ({deepness.toFixed(1)})
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={deepness}
                    onChange={(e) => setDeepness(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Energy ({energy.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={energy}
                    onChange={(e) => setEnergy(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Valence ({valence.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={valence}
                    onChange={(e) => setValence(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Danceability ({danceability.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={danceability}
                    onChange={(e) => setDanceability(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-spotify-muted">
                    Wackiness ({wackiness.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={wackiness}
                    onChange={(e) => setWackiness(Number(e.target.value))}
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
                    placeholder="например van_darkholme (если пусто — не задано)"
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
              disabled={saving}
              onClick={() => void publish()}
              className="rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {saving ? "Publishing…" : "Publish"}
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
