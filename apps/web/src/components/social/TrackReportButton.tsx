import { Flag, Loader2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";

const REASONS = [
  { id: "spam", label: "Spam or misleading" },
  { id: "copyright", label: "Copyright / unauthorized upload" },
  { id: "offensive", label: "Offensive or harmful" },
  { id: "other", label: "Other" },
] as const;

type TrackReportButtonProps = {
  trackId: string;
  disabled?: boolean;
};

export function TrackReportButton({ trackId, disabled }: TrackReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("spam");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.reportTrack(trackId, reason, detail.trim());
      setDone(true);
      window.setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-spotify-muted hover:border-white/30 hover:text-white disabled:opacity-50"
        title="Report this track to moderators"
      >
        <Flag className="h-3.5 w-3.5" />
        Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-labelledby="report-title"
            className="w-full max-w-md rounded-lg bg-spotify-highlight p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="report-title" className="text-lg font-bold">
                  Report track
                </h3>
                <p className="mt-1 text-sm text-spotify-muted">
                  Moderators review reports — not a public thread.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-spotify-muted" />
              </button>
            </div>

            {done ? (
              <p className="text-sm text-spotify-green">Thanks — report submitted.</p>
            ) : (
              <>
                <fieldset className="mb-4 space-y-2">
                  {REASONS.map((r) => (
                    <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="report-reason"
                        checked={reason === r.id}
                        onChange={() => setReason(r.id)}
                        className="accent-spotify-green"
                      />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Optional details for moderators…"
                  className="mb-4 w-full rounded-md bg-spotify-base px-3 py-2 text-sm"
                />
                {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                  className="rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                    </span>
                  ) : (
                    "Submit report"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
