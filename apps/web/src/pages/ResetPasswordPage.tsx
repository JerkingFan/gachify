import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing reset token in the link.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-gachi p-6">
      <div className="w-full max-w-md rounded-xl bg-spotify-elevated p-8 shadow-2xl">
        <h1 className="text-2xl font-bold">Choose a new password</h1>

        {done ? (
          <p className="mt-6 text-sm text-spotify-muted">Password updated — redirecting to login…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {!token && (
              <p className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-200">
                Invalid link — request a new reset email.
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-spotify-muted">New password</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-spotify-muted">Confirm password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
              />
            </label>
            {error && (
              <p className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-200">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !token}
              className="rounded-full bg-spotify-green py-3 font-bold text-black hover:bg-spotify-green-hover disabled:opacity-50"
            >
              {loading ? "…" : "Update password"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-spotify-muted">
          <Link to="/login" className="underline hover:text-white">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
