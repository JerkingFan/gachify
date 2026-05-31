import { useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { storeTokens } from "@/api/client";
import { useAuthStore } from "@/store/authStore";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (access && refresh) {
      storeTokens(access, refresh);
      void init().then(() => navigate("/", { replace: true }));
      return;
    }
    navigate("/login", { replace: true });
  }, [params, init, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-spotify-black text-spotify-muted">
      Signing you in…
    </div>
  );
}

export function AuthCallbackGuard() {
  const [params] = useSearchParams();
  if (!params.get("access_token")) {
    return <Navigate to="/login" replace />;
  }
  return <AuthCallbackPage />;
}
