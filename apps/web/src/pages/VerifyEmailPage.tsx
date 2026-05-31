import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }
    setStatus("loading");
    void api
      .verifyEmail(token)
      .then(() => {
        setStatus("ok");
        setMessage("Email verified — you can log in now.");
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-gachi p-6">
      <div className="w-full max-w-md rounded-xl bg-spotify-elevated p-8 shadow-2xl text-center">
        <h1 className="text-2xl font-bold">Email verification</h1>
        <p className="mt-4 text-sm text-spotify-muted">
          {status === "loading" && "Verifying…"}
          {status === "ok" && message}
          {status === "error" && message}
          {status === "idle" && "Preparing…"}
        </p>
        {(status === "ok" || status === "error") && (
          <Link
            to="/login"
            className="mt-6 inline-block rounded-full bg-spotify-green px-8 py-2 font-bold text-black hover:bg-spotify-green-hover"
          >
            Go to login
          </Link>
        )}
      </div>
    </div>
  );
}
