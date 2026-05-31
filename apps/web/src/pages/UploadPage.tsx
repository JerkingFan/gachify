import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "@/api/client";
import { TopBar } from "@/components/layout/TopBar";
import { useAuthStore } from "@/store/authStore";
import type { Track } from "@/types";

type Step = "form" | "uploading" | "processing" | "done" | "error";

const ACCEPT = ".flac,.wav,.mp3,audio/flac,audio/wav,audio/mpeg";

function isFailedTrack(t: Track): boolean {
  return t.status === "draft" && Boolean(t.processing_error);
}

function trackStatusLabel(t: Track): string {
  if (isFailedTrack(t)) return "failed";
  return t.status;
}

export function UploadPage() {
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [gachiPower, setGachiPower] = useState(50);
  const [deepness, setDeepness] = useState(5);
  const [track, setTrack] = useState<Track | null>(null);
  const [message, setMessage] = useState("");
  const [myTracks, setMyTracks] = useState<Track[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{
    total_plays: number;
    published_tracks: number;
  } | null>(null);

  const loadMyTracks = useCallback(async () => {
    try {
      const [res, stats] = await Promise.all([
        api.getCreatorTracks(),
        api.getCreatorAnalytics().catch(() => null),
      ]);
      setMyTracks(res.items);
      if (stats) {
        setAnalytics({ total_plays: stats.total_plays, published_tracks: stats.published_tracks });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadMyTracks();
  }, [isAuthenticated, loadMyTracks]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const pollStatus = async (trackId: string) => {
    const maxAttempts = 40;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const t = await api.getUploadStatus(trackId);
        setTrack(t);
        if (t.status === "published") {
          setStep("done");
          setMessage("Your remix is live in the catalog.");
          void loadMyTracks();
          return;
        }
        if (t.status === "pending_review") {
          setStep("done");
          setMessage("Transcode complete — your track is awaiting moderator approval.");
          void loadMyTracks();
          return;
        }
        if (isFailedTrack(t)) {
          setStep("error");
          setMessage(t.processing_error ?? "Transcode failed");
          void loadMyTracks();
          return;
        }
        setMessage(`Status: ${t.status}… (waiting for transcode worker)`);
      } catch {
        /* retry */
      }
    }
    setStep("error");
    setMessage("Transcode timed out — is the worker running? (go run ./cmd/worker)");
  };

  const handleRetry = async (trackId: string) => {
    setRetryingId(trackId);
    setMessage("Re-queuing transcode…");
    setStep("processing");
    try {
      const t = await api.retryTranscode(trackId);
      setTrack(t);
      void pollStatus(trackId);
    } catch (err) {
      setStep("error");
      setMessage(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setStep("uploading");
    setMessage("Creating upload session…");

    try {
      const init = await api.initUpload({
        title: title.trim(),
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        duration_ms: 0,
        gachi_metadata: {
          gachi_power_level: gachiPower,
          deepness_score: deepness,
        },
      });

      setMessage("Uploading master to storage…");
      const putRes = await fetch(init.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Storage upload failed (${putRes.status})`);
      }

      setMessage("Finalizing — starting transcode…");
      const completed = await api.completeUpload(init.track_id, { duration_ms: 0 });
      setTrack(completed);
      setStep("processing");
      void pollStatus(init.track_id);
    } catch (err) {
      setStep("error");
      setMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const failedTrackId = track && isFailedTrack(track) ? track.id : null;

  return (
    <>
      <TopBar title="Creator Hub" />
      <div className="flex-1 overflow-y-auto px-6 pb-12 pt-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-spotify-green text-black">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Upload remix</h1>
              <p className="text-sm text-spotify-muted">
                FLAC / WAV / MP3 → MinIO → transcode queue → published
              </p>
            </div>
          </div>

          {analytics && (
            <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg bg-spotify-elevated p-4 text-sm">
              <div>
                <p className="text-spotify-muted">Total plays</p>
                <p className="text-2xl font-bold tabular-nums">{analytics.total_plays.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-spotify-muted">Published tracks</p>
                <p className="text-2xl font-bold tabular-nums">{analytics.published_tracks}</p>
              </div>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-6 rounded-xl bg-spotify-elevated p-6">
              <label className="block text-sm">
                <span className="text-spotify-muted">Title</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
                  placeholder="Deep Dark Fantasy (Your Mix)"
                />
              </label>

              <label className="block text-sm">
                <span className="text-spotify-muted">Audio file</span>
                <input
                  required
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm text-spotify-muted file:mr-4 file:rounded-full file:border-0 file:bg-spotify-green file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="text-spotify-muted">♂️ Power level ({gachiPower})</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={gachiPower}
                    onChange={(e) => setGachiPower(Number(e.target.value))}
                    className="mt-2 w-full accent-spotify-green"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-spotify-muted">Deepness ({deepness})</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={deepness}
                    onChange={(e) => setDeepness(Number(e.target.value))}
                    className="mt-2 w-full accent-spotify-green"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={!file}
                className="w-full rounded-full bg-spotify-green py-3 font-bold text-black hover:bg-spotify-green-hover disabled:opacity-50"
              >
                Upload & publish
              </button>
            </form>
          )}

          {step !== "form" && (
            <div className="rounded-xl bg-spotify-elevated p-6">
              <div className="flex items-start gap-3">
                {step === "processing" || step === "uploading" ? (
                  <Loader2 className="h-6 w-6 shrink-0 animate-spin text-spotify-green" />
                ) : step === "done" ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-spotify-green" />
                ) : (
                  <AlertCircle className="h-6 w-6 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize">{step === "error" ? "failed" : step}</p>
                  <p className="mt-1 text-sm text-spotify-muted">{message}</p>
                  {track && (
                    <p className="mt-2 text-xs text-spotify-subtle">
                      Track ID: {track.id} · status: {trackStatusLabel(track)}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {step === "error" && failedTrackId && (
                  <button
                    type="button"
                    disabled={retryingId === failedTrackId}
                    onClick={() => void handleRetry(failedTrackId)}
                    className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-semibold text-black hover:bg-spotify-green-hover disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry transcode
                  </button>
                )}
                {(step === "done" || step === "error") && (
                  <button
                    type="button"
                    className="text-sm text-spotify-green underline"
                    onClick={() => {
                      setStep("form");
                      setTrack(null);
                      setFile(null);
                      setMessage("");
                    }}
                  >
                    Upload another
                  </button>
                )}
              </div>
            </div>
          )}

          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Your uploads</h2>
              <button
                type="button"
                onClick={() => void loadMyTracks()}
                className="text-sm text-spotify-muted hover:text-white"
              >
                Refresh
              </button>
            </div>
            {myTracks.length === 0 ? (
              <p className="text-sm text-spotify-muted">No uploads yet.</p>
            ) : (
              <ul className="space-y-2">
                {myTracks.map((t) => {
                  const failed = isFailedTrack(t);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-spotify-highlight px-4 py-2 text-sm"
                    >
                      <span className="truncate font-medium">{t.title}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {failed && (
                          <button
                            type="button"
                            disabled={retryingId === t.id}
                            onClick={() => void handleRetry(t.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-spotify-green/20 px-2 py-0.5 text-xs font-medium text-spotify-green hover:bg-spotify-green/30 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            t.status === "published"
                              ? "bg-spotify-green/20 text-spotify-green"
                              : failed
                                ? "bg-red-500/20 text-red-300"
                                : t.status === "processing"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-white/10 text-spotify-muted"
                          }`}
                        >
                          {trackStatusLabel(t)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
