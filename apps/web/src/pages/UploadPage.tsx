import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/client";
import { TrackMetadataForm } from "@/components/creator/TrackMetadataForm";
import { TopBar } from "@/components/layout/TopBar";
import { uploadTrackCover } from "@/lib/coverUpload";
import { readLrcFile } from "@/lib/lyrics";
import {
  buildGachiMetadataFromDraft,
  COVER_PRESETS,
  type DraftMetadataFields,
} from "@/lib/creatorMetadata";
import { useAuthStore } from "@/store/authStore";
import type { Track } from "@/types";

type Step = "metadata" | "audio" | "uploading" | "processing" | "done" | "error";

const ACCEPT = ".flac,.wav,.mp3,audio/flac,audio/wav,audio/mpeg";

const defaultFields: DraftMetadataFields = {
  gachiPower: 50,
  deepness: 5,
  moodTags: "",
  coverGradient: COVER_PRESETS[0],
  coverUrl: "",
  lyricsLrc: "",
};

function isFailedTrack(t: Track): boolean {
  return t.status === "draft" && Boolean(t.processing_error);
}

function trackStatusLabel(t: Track): string {
  if (isFailedTrack(t)) return "failed";
  return t.status.replace(/_/g, " ");
}

export function UploadPage() {
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<Step>("metadata");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<DraftMetadataFields>(defaultFields);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [message, setMessage] = useState("");
  const [myTracks, setMyTracks] = useState<Track[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{
    total_plays: number;
    published_tracks: number;
    follower_count: number;
  } | null>(null);

  const loadMyTracks = useCallback(async () => {
    try {
      const [res, stats] = await Promise.all([
        api.getCreatorTracks(),
        api.getCreatorAnalytics().catch(() => null),
      ]);
      setMyTracks(res.items);
      if (stats) {
        setAnalytics({
          total_plays: stats.total_plays,
          published_tracks: stats.published_tracks,
          follower_count: stats.follower_count ?? 0,
        });
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

  const buildMeta = async () => {
    let lyricsLrc = fields.lyricsLrc.trim();
    if (!lyricsLrc && lrcFile) {
      lyricsLrc = await readLrcFile(lrcFile);
    }
    return buildGachiMetadataFromDraft({ ...fields, lyricsLrc });
  };

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
        if (t.status === "approved") {
          setStep("done");
          setMessage(
            "Moderation passed — open the track page to schedule your release or publish now.",
          );
          void loadMyTracks();
          return;
        }
        if (t.status === "pending_review") {
          setStep("done");
          setMessage("Transcode complete — awaiting moderator approval.");
          void loadMyTracks();
          return;
        }
        if (isFailedTrack(t)) {
          setStep("error");
          setMessage(t.processing_error ?? "Transcode failed");
          void loadMyTracks();
          return;
        }
        setMessage(`Status: ${trackStatusLabel(t)}… (waiting for transcode worker)`);
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

  const saveMetadata = async () => {
    if (!title.trim()) return;
    setMessage("Saving draft…");
    try {
      const gachi_metadata = await buildMeta();
      const draft = draftId
        ? await api.updateCreatorDraft(draftId, {
            title: title.trim(),
            description: description.trim(),
            gachi_metadata,
          })
        : await api.createCreatorDraft({
            title: title.trim(),
            description: description.trim(),
            gachi_metadata,
          });
      setDraftId(draft.id);
      if (coverFile) {
        setMessage("Uploading cover…");
        await uploadTrackCover(draft.id, coverFile);
      }
      setStep("audio");
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save draft");
    }
  };

  const uploadAudio = async () => {
    if (!file || !draftId) return;
    setStep("uploading");
    setMessage("Preparing upload…");
    try {
      const presign = await api.presignCreatorDraft(draftId, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
      });
      setMessage("Uploading master to storage…");
      const putRes = await fetch(presign.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Storage upload failed (${putRes.status})`);
      }
      setMessage("Finalizing — starting transcode…");
      const completed = await api.completeUpload(draftId, { duration_ms: 0 });
      setTrack(completed);
      setStep("processing");
      void pollStatus(draftId);
    } catch (err) {
      setStep("error");
      setMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const resetFlow = () => {
    setStep("metadata");
    setDraftId(null);
    setTrack(null);
    setFile(null);
    setTitle("");
    setDescription("");
    setFields(defaultFields);
    setCoverFile(null);
    setMessage("");
  };

  const changeTrackCover = async (trackId: string, file: File) => {
    try {
      await uploadTrackCover(trackId, file);
      void loadMyTracks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cover upload failed");
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
                1. Metadata draft → 2. Audio → transcode → moderation → schedule
              </p>
            </div>
          </div>

          {analytics && (
            <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-spotify-elevated p-4 text-sm">
              <div>
                <p className="text-spotify-muted">Total plays</p>
                <p className="text-2xl font-bold tabular-nums">
                  {analytics.total_plays.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-spotify-muted">Published</p>
                <p className="text-2xl font-bold tabular-nums">{analytics.published_tracks}</p>
              </div>
              <div>
                <p className="text-spotify-muted">Followers</p>
                <p className="text-2xl font-bold tabular-nums">
                  {analytics.follower_count.toLocaleString()}
                </p>
                <p className="text-xs text-spotify-subtle">dungeon masters</p>
              </div>
            </div>
          )}

          {step === "metadata" && (
            <div className="rounded-xl bg-spotify-elevated p-6">
              <p className="mb-4 text-sm text-spotify-muted">
                Save tags, cover, and description before uploading audio — you can edit while the
                track is still a draft.
              </p>
              <TrackMetadataForm
                title={title}
                description={description}
                fields={fields}
                lrcFile={lrcFile}
                coverFile={coverFile}
                onTitle={setTitle}
                onDescription={setDescription}
                onFields={setFields}
                onLrcFile={setLrcFile}
                onCoverFile={setCoverFile}
                onLrcText={(v) => setFields((f) => ({ ...f, lyricsLrc: v }))}
              />
              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => void saveMetadata()}
                className="mt-6 w-full rounded-full bg-spotify-green py-3 font-bold text-black hover:bg-spotify-green-hover disabled:opacity-50"
              >
                Continue to audio
              </button>
              {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}
            </div>
          )}

          {step === "audio" && (
            <div className="space-y-4 rounded-xl bg-spotify-elevated p-6">
              <p className="text-sm text-spotify-muted">
                Draft saved. Upload FLAC / WAV / MP3 — transcode starts after upload.
              </p>
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
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("metadata")}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!file}
                  onClick={() => void uploadAudio()}
                  className="flex-1 rounded-full bg-spotify-green py-3 font-bold text-black disabled:opacity-50"
                >
                  Upload & transcode
                </button>
              </div>
            </div>
          )}

          {step !== "metadata" && step !== "audio" && (
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
                      {track.status === "approved" && (
                        <>
                          {" "}
                          ·{" "}
                          <Link to={`/track/${track.id}`} className="text-spotify-green underline">
                            Schedule release
                          </Link>
                        </>
                      )}
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
                    className="inline-flex items-center gap-2 rounded-full bg-spotify-green px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry transcode
                  </button>
                )}
                {(step === "done" || step === "error") && (
                  <button
                    type="button"
                    className="text-sm text-spotify-green underline"
                    onClick={resetFlow}
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
                      <Link to={`/track/${t.id}`} className="min-w-0 truncate font-medium hover:underline">
                        {t.title}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="cursor-pointer text-xs text-spotify-muted hover:text-white">
                          Cover
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void changeTrackCover(t.id, f);
                            }}
                          />
                        </label>
                        {failed && (
                          <button
                            type="button"
                            disabled={retryingId === t.id}
                            onClick={() => void handleRetry(t.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-spotify-green/20 px-2 py-0.5 text-xs font-medium text-spotify-green"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                            t.status === "published"
                              ? "bg-spotify-green/20 text-spotify-green"
                              : t.status === "approved"
                                ? "bg-blue-500/20 text-blue-300"
                                : failed
                                  ? "bg-red-500/20 text-red-300"
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
