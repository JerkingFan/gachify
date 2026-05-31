import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-gachi p-6">
      <div className="w-full max-w-md rounded-xl bg-spotify-elevated p-8 shadow-2xl">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="mt-2 text-sm text-spotify-muted">
          Enter your email and we&apos;ll send a reset link if an account exists.
        </p>

        {sent ? (
          <p className="mt-6 rounded-md bg-spotify-highlight px-3 py-3 text-sm">
            If that email is registered, a reset link was sent. Check your inbox (or server logs in dev).
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-spotify-muted">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
              />
            </label>
            {error && (
              <p className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-200">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-spotify-green py-3 font-bold text-black hover:bg-spotify-green-hover disabled:opacity-50"
            >
              {loading ? "…" : "Send reset link"}
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
