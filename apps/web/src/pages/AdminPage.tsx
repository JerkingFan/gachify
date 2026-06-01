import { RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPendingTrackPanel } from "@/components/admin/AdminPendingTrackPanel";
import {
  adminApi,
  clearAdminKey,
  getAdminKey,
  setAdminKey,
  type AdminTrack,
  type DLQEntry,
  type QueueDepths,
} from "@/lib/adminApi";

export function AdminPage() {
  const [keyInput, setKeyInput] = useState("");
  const [authed, setAuthed] = useState(() => Boolean(getAdminKey()));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [dlq, setDlq] = useState<DLQEntry[]>([]);
  const [depths, setDepths] = useState<QueueDepths | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, dlqRes, depthRes] = await Promise.all([
        adminApi.listPending(),
        adminApi.listDLQ(),
        adminApi.queueDepths(),
      ]);
      setTracks(pending.items);
      setDlq(dlqRes.items ?? []);
      setDepths(depthRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
      if (err instanceof Error && err.message.includes("Admin key")) {
        setAuthed(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ok = await adminApi.verifyKey(keyInput.trim());
    if (!ok) {
      setError("Invalid admin key");
      return;
    }
    setAdminKey(keyInput.trim());
    setAuthed(true);
  };

  const logout = () => {
    clearAdminKey();
    setAuthed(false);
    setKeyInput("");
  };

  const approve = async (id: string) => {
    await adminApi.approveTrack(id);
    await load();
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    await adminApi.rejectTrack(id, reason);
    await load();
  };

  const retry = async (trackId: string) => {
    await adminApi.retryDLQ(trackId);
    await load();
  };

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-spotify-black p-6">
        <form
          onSubmit={(e) => void login(e)}
          className="w-full max-w-md rounded-xl bg-spotify-elevated p-8 shadow-2xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <Shield className="h-8 w-8 text-spotify-green" />
            <div>
              <h1 className="text-xl font-bold">Gachify Admin</h1>
              <p className="text-sm text-spotify-muted">Enter operator secret</p>
            </div>
          </div>
          <input
            type="password"
            required
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="GACHIFY_ADMIN_SECRET"
            className="w-full rounded-md bg-spotify-highlight px-3 py-2 outline-none focus:ring-2 focus:ring-spotify-green"
          />
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-spotify-green py-3 font-bold text-black"
          >
            Continue
          </button>
          <p className="mt-4 text-center text-sm text-spotify-muted">
            <Link to="/" className="underline hover:text-white">
              Back to player
            </Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-spotify-black p-6 text-white">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Moderation console</h1>
          <p className="text-sm text-spotify-muted">pending_review · transcode DLQ</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md bg-red-900/40 px-4 py-2 text-sm text-red-200">{error}</p>
      )}

      {depths && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Pending", depths.pending],
              ["Processing", depths.processing],
              ["Retry", depths.retry],
              ["DLQ", depths.dlq],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-spotify-elevated p-4">
              <p className="text-xs uppercase text-spotify-muted">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Pending review ({tracks.length})</h2>
        {tracks.length === 0 ? (
          <p className="text-sm text-spotify-muted">No tracks awaiting moderation.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-lg bg-spotify-elevated">
            {tracks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-xs text-spotify-muted">
                    {t.creator?.display_name ?? t.creator?.handle ?? "Unknown"} · {t.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className="rounded-full border border-white/30 px-4 py-1 text-sm hover:bg-white/10"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => void approve(t.id).catch(setErrorMsg(setError))}
                    className="rounded-full bg-spotify-green px-4 py-1 text-sm font-bold text-black"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void reject(t.id).catch(setErrorMsg(setError))}
                    className="rounded-full border border-red-400/50 px-4 py-1 text-sm text-red-200"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Transcode DLQ ({dlq.length})</h2>
        {dlq.length === 0 ? (
          <p className="text-sm text-spotify-muted">Dead-letter queue is empty.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-lg bg-spotify-elevated">
            {dlq.map((entry) => (
              <li
                key={`${entry.job.track_id}-${entry.job.job_id}`}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm">{entry.job.track_id}</p>
                  <p className="mt-1 text-xs text-red-200">{entry.error}</p>
                  <p className="mt-1 text-xs text-spotify-muted">
                    {new Date(entry.failed_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void retry(entry.job.track_id).catch(setErrorMsg(setError))}
                  className="rounded-full border border-white/30 px-4 py-1 text-sm hover:bg-white/10"
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedId && (
        <AdminPendingTrackPanel
          trackId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => void load()}
          onApprove={approve}
          onReject={reject}
        />
      )}
    </div>
  );
}

function setErrorMsg(setError: (v: string | null) => void) {
  return (err: unknown) => {
    setError(err instanceof Error ? err.message : "Action failed");
  };
}
