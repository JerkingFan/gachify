import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const { login, register, isAuthenticated } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={returnTo.startsWith("/") ? returnTo : "/"} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          handle,
          display_name: displayName || handle,
        });
      }
      navigate(returnTo.startsWith("/") ? returnTo : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-gachi p-6">
      <div className="w-full max-w-md rounded-xl bg-spotify-elevated p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-spotify-green text-2xl font-bold text-black">
            ♂
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gachify</h1>
            <p className="text-sm text-spotify-muted">
              {mode === "login" ? "Sign in to sync your library" : "Create your account"}
            </p>
          </div>
        </div>

        <div className="mb-6 flex rounded-full bg-spotify-highlight p-1">
          <button
            type="button"
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${
              mode === "login" ? "bg-spotify-elevated text-white" : "text-spotify-muted"
            }`}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${
              mode === "register" ? "bg-spotify-elevated text-white" : "text-spotify-muted"
            }`}
            onClick={() => setMode("register")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "register" && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-spotify-muted">Handle</span>
                <input
                  required
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
                  placeholder="dungeon_master"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-spotify-muted">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
                  placeholder="Optional"
                />
              </label>
            </>
          )}
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-spotify-muted">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md bg-spotify-highlight px-3 py-2 text-white outline-none focus:ring-2 focus:ring-spotify-green"
            />
          </label>

          {mode === "login" && (
            <p className="text-right text-xs">
              <Link to="/forgot-password" className="text-spotify-muted underline hover:text-white">
                Forgot password?
              </Link>
            </p>
          )}

          {error && (
            <p className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-spotify-green py-3 font-bold text-black hover:bg-spotify-green-hover disabled:opacity-50"
          >
            {loading ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>

          <a
            href="/api/v1/auth/oidc/google/start"
            className="mt-2 flex items-center justify-center gap-2 rounded-full border border-spotify-highlight py-3 text-sm font-semibold hover:bg-spotify-highlight"
          >
            Continue with Google
          </a>
        </form>

        <p className="mt-6 text-center text-sm text-spotify-muted">
          <Link to="/" className="underline hover:text-white">
            Continue as guest
          </Link>
        </p>
      </div>
    </div>
  );
}
